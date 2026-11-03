package com.tailorae.payment

import com.tailorae.common.ApiException
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.ProcessedEvents
import com.tailorae.order.OnlinePaymentStatus
import com.tailorae.order.OrderService
import com.tailorae.order.OrderTopics
import com.tailorae.order.OrderPaid
import com.tailorae.common.Outbox
import com.tailorae.order.RefundDue
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

data class CheckoutSession(val keyId: String, val gatewayOrderId: String, val amountPaise: Long, val currency: String, val orderId: UUID, val orderNumber: String, val email: String)

data class VerifyRequest(val orderId: UUID? = null, val razorpay_order_id: String? = null, val razorpay_payment_id: String? = null, val razorpay_signature: String? = null)

data class VerifyResult(val confirmed: Boolean, val paymentStatus: String?)

@Component
class RazorpayStatus(private val props: RazorpayProperties) : OnlinePaymentStatus {
    override fun unavailableReason(): String? = if (props.configured) null else "Online payment is not available right now"
}

/**
 * Taking money, and giving it back. Every gateway event is written once to
 * `payment_event` (unique per gateway reference), so a webhook redelivery, or a
 * webhook racing the browser's verify call, changes the order exactly once.
 */
@Service
class PaymentService(
    private val jdbc: JdbcClient,
    private val gateway: PaymentGateway,
    private val props: RazorpayProperties,
    private val orders: OrderService,
    private val audit: Audit,
    private val json: JsonMapper,
    private val outbox: Outbox,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun config() = mapOf(
        "enabled" to props.configured,
        "keyId" to props.keyId.ifBlank { null },
        "currency" to "INR",
        "reason" to if (props.configured) null else "Online payment is not available right now — choose cash on delivery",
    )

    /** A gateway order for the shopper's unpaid online order (reused if one exists). */
    @Transactional
    fun createSession(customerId: UUID, orderId: UUID): CheckoutSession {
        val o = order(orderId)
        if (o.customerId != customerId) throw NotFoundException("Order not found")
        if (o.method != "RAZORPAY") throw BadRequestException("This order is cash on delivery")
        if (o.paymentStatus != "PENDING" || o.status == "CANCELLED") throw ConflictException("This order is not awaiting payment")
        if (!props.configured) throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Online payment is not available right now")
        val gatewayOrderId = o.gatewayOrderId ?: gateway.createOrder(o.totalPaise, o.orderNumber, mapOf("orderId" to orderId.toString(), "orderNumber" to o.orderNumber))
            .also { jdbc.sql("update customer_order set gateway_order_id = :g, updated_at = now() where id = :id").param("g", it).param("id", orderId).update() }
        return CheckoutSession(props.keyId, gatewayOrderId, o.totalPaise, "INR", orderId, o.orderNumber, o.email)
    }

    /** The browser's handshake after paying. The signature proves it came from Razorpay; the fetch proves the money moved. */
    @Transactional
    fun verify(customerId: UUID, req: VerifyRequest): VerifyResult {
        if (req.razorpay_order_id.isNullOrBlank() || req.razorpay_payment_id.isNullOrBlank() || req.razorpay_signature.isNullOrBlank()) {
            throw BadRequestException("razorpay_order_id, razorpay_payment_id and razorpay_signature are required")
        }
        if (!RazorpaySignatures.checkoutValid(req.razorpay_order_id, req.razorpay_payment_id, req.razorpay_signature, props.keySecret)) {
            throw BadRequestException("Payment signature could not be verified")
        }
        val orderId = jdbc.sql("select id from customer_order where gateway_order_id = :g and customer_id = :c")
            .param("g", req.razorpay_order_id).param("c", customerId).query(UUID::class.java).optional()
            .orElseThrow { NotFoundException("Order not found") }
        val payment = runCatching { gateway.fetchPayment(req.razorpay_payment_id) }.getOrElse {
            log.warn("Could not confirm {} with the gateway: {}", req.razorpay_payment_id, it.message)
            return VerifyResult(false, null) // the webhook will settle it
        }
        if (payment.orderId != req.razorpay_order_id) throw BadRequestException("Payment does not match this order")
        if (payment.status != "captured" && payment.status != "authorized") throw ConflictException("Payment is ${payment.status} and has not been collected")
        return VerifyResult(true, capture(orderId, payment.id, payment.amountPaise, null))
    }

    /** Raw-body HMAC first; a bad signature is refused before anything is parsed. */
    @Transactional
    fun webhook(rawBody: ByteArray, signature: String?): String {
        if (!RazorpaySignatures.webhookValid(rawBody, signature, props.webhookSecret)) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Invalid webhook signature")
        }
        val body = json.readTree(rawBody)
        val action = Webhooks.decide(body)
        if (action is WebhookAction.Ignore) return action.reason
        val orderId = Webhooks.orderReference(action)?.let { (by, value) ->
            if (by == "id") runCatching { UUID.fromString(value) }.getOrNull()
            else jdbc.sql("select id from customer_order where order_number = :n").param("n", value).query(UUID::class.java).optional().orElse(null)
        } ?: (action as? WebhookAction.Capture)?.payment?.orderId?.let(::orderByGatewayOrder)
            ?: (action as? WebhookAction.Fail)?.payment?.orderId?.let(::orderByGatewayOrder)
            ?: return "no order reference"
        return when (action) {
            is WebhookAction.Capture -> capture(orderId, action.payment.id, action.payment.amountPaise, body.toString()) ?: "anomaly"
            is WebhookAction.Fail -> fail(orderId, action.payment.id, action.reason, body.toString())
            is WebhookAction.Refund -> recordRefund(orderId, action.refundId, action.amountPaise, body.toString())
            is WebhookAction.Ignore -> action.reason
        }
    }

    /** Refunds [amountPaise] of an online order (capped at what is still refundable). */
    @Transactional(noRollbackFor = [ConflictException::class])
    fun refund(orderId: UUID, amountPaise: Long?, reason: String, adminId: UUID?): Long {
        val o = order(orderId)
        if (o.method != "RAZORPAY" || o.paymentId == null) throw ConflictException("This order was not paid online — refund it by bank transfer")
        val cap = o.totalPaise - o.refundedPaise
        if (cap <= 0) throw ConflictException("This order has already been refunded in full")
        val amount = amountPaise ?: cap
        if (amount <= 0) throw BadRequestException("Refund amount must be more than zero")
        if (amount > cap) throw BadRequestException("Refund amount exceeds the ₹%.2f still refundable on this order".format(cap / 100.0))
        val refundId = gateway.refund(o.paymentId, amount, mapOf("orderId" to orderId.toString(), "orderNumber" to o.orderNumber, "reason" to reason.take(200)))
        recordRefund(orderId, refundId, amount, null)
        adminId?.let { audit.record("admin", it, "REFUND", "customer_order", orderId.toString(), after = mapOf("amountPaise" to amount, "refundId" to refundId)) }
        return amount
    }

    // ------------------------------------------------------------ applying events

    /** Returns the payment status after the capture, or null when it was an anomaly needing a human. */
    private fun capture(orderId: UUID, paymentId: String, amountPaise: Long, raw: String?): String? {
        val o = order(orderId, lock = true)
        if (!event(orderId, "CAPTURED", paymentId, amountPaise, null, raw)) return o.paymentStatus // already recorded
        val anomaly = when {
            o.paymentStatus == "PAID" && o.paymentId != paymentId -> "Order is already paid by ${o.paymentId}; $paymentId looks like a second charge and needs refunding"
            o.paymentStatus == "REFUNDED" -> "Capture $paymentId arrived on an order already refunded — needs reconciling by hand"
            o.paymentStatus == "CANCELLED" || o.status == "CANCELLED" -> "Capture $paymentId arrived on a cancelled order — the money must be refunded"
            amountPaise != o.totalPaise -> "Captured ₹%.2f but the order total is ₹%.2f".format(amountPaise / 100.0, o.totalPaise / 100.0)
            else -> null
        }
        if (o.paymentStatus == "PAID" && o.paymentId == paymentId) return "PAID"
        if (anomaly != null) {
            event(orderId, "ANOMALY", "capture:$paymentId", amountPaise, anomaly, raw)
            orders.timeline(orderId, "PAYMENT_ANOMALY", anomaly, "system", null)
            return null
        }
        jdbc.sql(
            """
            update customer_order set payment_status = 'PAID', payment_id = :p, payment_due_by = null,
                status = case when status = 'PENDING' then 'CONFIRMED' else status end, updated_at = now()
            where id = :id
            """.trimIndent(),
        ).param("p", paymentId).param("id", orderId).update()
        jdbc.sql("update seller_order set status = 'CONFIRMED', updated_at = now() where order_id = :o and status = 'PENDING'").param("o", orderId).update()
        orders.timeline(orderId, "PAYMENT_CAPTURED", "Payment received via Razorpay — ₹%.2f [$paymentId]".format(amountPaise / 100.0), "system", null)
        outbox.record(OrderTopics.PAID, orderId.toString(), OrderPaid(orderId, o.orderNumber, o.email, amountPaise))
        return "PAID"
    }

    private fun fail(orderId: UUID, paymentId: String, reason: String?, raw: String?): String {
        val o = order(orderId, lock = true)
        if (!event(orderId, "FAILED", paymentId, 0, reason, raw)) return "duplicate"
        if (o.paymentStatus == "PAID" || o.paymentStatus == "REFUNDED") return "ignored"
        // The shopper can try again until the payment window closes; the order stays PENDING.
        orders.timeline(orderId, "PAYMENT_FAILED", "Payment attempt failed${reason?.let { " — $it" } ?: ""} [$paymentId]", "system", null)
        return "recorded"
    }

    private fun recordRefund(orderId: UUID, refundId: String, amountPaise: Long, raw: String?): String {
        if (!event(orderId, "REFUNDED", refundId, amountPaise, null, raw)) return "duplicate"
        jdbc.sql(
            """
            update customer_order set refunded_paise = least(total_paise, refunded_paise + :a),
                payment_status = case when refunded_paise + :a >= total_paise then 'REFUNDED' else payment_status end, updated_at = now()
            where id = :id
            """.trimIndent(),
        ).param("a", amountPaise).param("id", orderId).update()
        jdbc.sql("update return_request set refunded_at = coalesce(refunded_at, now()) where order_id = :o and status = 'COMPLETED'").param("o", orderId).update()
        orders.timeline(orderId, "PAYMENT_REFUNDED", "Refund of ₹%.2f processed by Razorpay [$refundId]".format(amountPaise / 100.0), "system", null)
        return "refunded"
    }

    /** True the first time this (kind, reference) is seen. */
    private fun event(orderId: UUID, kind: String, ref: String, amount: Long, message: String?, raw: String?): Boolean =
        jdbc.sql(
            """
            insert into payment_event (id, order_id, kind, gateway_ref, amount_paise, message, raw)
            values (:id, :o, :k, :r, :a, :m, cast(:raw as jsonb)) on conflict (gateway, kind, gateway_ref) do nothing
            """.trimIndent(),
        ).param("id", Ids.newId()).param("o", orderId).param("k", kind).param("r", ref).param("a", amount).param("m", message).param("raw", raw).update() == 1

    private data class OrderRow(
        val customerId: UUID, val orderNumber: String, val status: String, val paymentStatus: String, val method: String,
        val totalPaise: Long, val refundedPaise: Long, val gatewayOrderId: String?, val paymentId: String?, val email: String,
    )

    private fun order(id: UUID, lock: Boolean = false): OrderRow =
        jdbc.sql("select * from customer_order where id = :id${if (lock) " for update" else ""}").param("id", id).query { rs, _ ->
            OrderRow(rs.getObject("customer_id", UUID::class.java), rs.getString("order_number"), rs.getString("status"), rs.getString("payment_status"),
                rs.getString("payment_method"), rs.getLong("total_paise"), rs.getLong("refunded_paise"), rs.getString("gateway_order_id"),
                rs.getString("payment_id"), rs.getString("contact_email"))
        }.optional().orElseThrow { NotFoundException("Order not found") }

    private fun orderByGatewayOrder(gatewayOrderId: String): UUID? =
        jdbc.sql("select id from customer_order where gateway_order_id = :g").param("g", gatewayOrderId).query(UUID::class.java).optional().orElse(null)
}

/** Refunds raised by the order module (cancellations, seller cancellations, completed returns). */
@Component
class RefundConsumer(
    private val payments: PaymentService,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
    private val tx: org.springframework.transaction.support.TransactionTemplate,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @KafkaListener(topics = [OrderTopics.REFUND_DUE], groupId = "payment-refunds")
    fun onRefundDue(message: String) {
        val event = json.readTree(message)
        val eventId = UUID.fromString(event.get("eventId").asString())
        val due = json.treeToValue(event.get("payload"), RefundDue::class.java)
        tx.executeWithoutResult {
            if (!processed.firstTime("payment-refunds", eventId)) return@executeWithoutResult
            try {
                payments.refund(due.orderId, due.amountPaise, due.reason, null)
            } catch (e: ConflictException) {
                // Not paid online, or already refunded: nothing for the gateway to do.
                log.info("Refund for {} not sent: {}", due.orderNumber, e.message)
            }
        }
    }
}
