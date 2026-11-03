package com.tailorae.order

import com.tailorae.commerce.AddressRequest
import com.tailorae.commerce.AddressService
import com.tailorae.commerce.CartService
import com.tailorae.commerce.CouponContext
import com.tailorae.commerce.CouponLine
import com.tailorae.commerce.CouponRules
import com.tailorae.commerce.CouponService
import com.tailorae.commerce.PricedLine
import com.tailorae.common.ApiException
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Outbox
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.SystemSettings
import com.tailorae.finance.FinanceService
import com.tailorae.finance.OrderSplit
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.security.SecureRandom
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Checkout and everything after it, for customers and staff. One customer
 * order becomes one seller order per shop (finance/OrderSplit), stock comes off
 * atomically, and every status change keeps the parent and its parts in step
 * (OrderStatusRules).
 */
@Service
class OrderService(
    private val jdbc: JdbcClient,
    private val json: JsonMapper,
    private val cart: CartService,
    private val addresses: AddressService,
    private val coupons: CouponService,
    private val finance: FinanceService,
    private val settings: SystemSettings,
    private val outbox: Outbox,
    private val audit: Audit,
    private val onlinePayments: ObjectProvider<OnlinePaymentStatus>,
) {
    private val random = SecureRandom()

    // ================================================================ checkout

    @Transactional
    fun checkout(customerId: UUID, req: CheckoutRequest): OrderView {
        if (req.paymentMethod == PaymentMethod.RAZORPAY) {
            val payments = onlinePayments.ifAvailable
            val reason = if (payments == null) "Online payment is not available right now" else payments.unavailableReason()
            if (reason != null) throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, reason)
        }
        val customer = jdbc.sql("select email, phone, type from customer where id = :c").param("c", customerId)
            .query { rs, _ -> Triple(rs.getString("email"), rs.getString("phone"), rs.getString("type")) }.single()

        val shipping = when {
            req.addressId != null -> snapshot(addresses.get(customerId, req.addressId).let {
                AddressRequest(it.label, it.fullName, it.phone, it.email, it.line1, it.line2, it.city, it.state, it.postalCode, it.country, it.gstin)
            })
            req.shippingAddress != null -> {
                if (req.saveAddress) addresses.create(customerId, req.shippingAddress)
                snapshot(req.shippingAddress)
            }
            else -> throw BadRequestException("Choose a delivery address")
        }
        val billing = req.billingAddress?.let(::snapshot) ?: shipping

        val lines = cart.lines(customerId)
        if (lines.isEmpty()) throw BadRequestException("Your cart is empty")
        val minimums = jdbc.sql("select id, min_order_quantity, max_order_quantity from product where id = any(:ids)")
            .param("ids", lines.map { it.productId }.distinct().toTypedArray())
            .query { rs, _ -> rs.getObject("id", UUID::class.java) to (rs.getInt("min_order_quantity") to rs.getObject("max_order_quantity") as Int?) }
            .list().toMap()
        for (l in lines) {
            if (!l.available) throw ConflictException("${l.name} is no longer available")
            if (l.quantity > l.stock) throw ConflictException("Insufficient stock for ${l.name}")
            val (min, max) = minimums.getValue(l.productId)
            if (l.quantity < min) throw BadRequestException("${l.name} has a minimum order of $min")
            if (max != null && l.quantity > max && !l.isBulkOrder) throw BadRequestException("${l.name} is limited to $max per order")
        }

        val subtotal = lines.sumOf { it.lineTotalPaise }
        var discount = 0L
        var couponId: UUID? = null
        var couponCode: String? = null
        if (!req.couponCode.isNullOrBlank()) {
            val coupon = coupons.find(req.couponCode)
            val outcome = CouponRules.resolve(
                coupon, subtotal,
                CouponContext(
                    isBusiness = customer.third == "BUSINESS",
                    lines = lines.map { CouponLine(it.productId, it.categoryId, it.unitPaise, it.quantity) },
                    customerUses = coupon?.let { coupons.customerUses(it.id, customerId) } ?: 0,
                ),
            )
            if (!outcome.ok) throw ApiException(outcome.status, outcome.error!!)
            discount = outcome.discountPaise
            couponId = coupon!!.id
            couponCode = coupon.code
        }
        val freeAbove = settings.long(SystemSettings.FREE_SHIPPING_ABOVE_PAISE, 99_900)
        val shippingPaise = if (subtotal - discount >= freeAbove) 0 else settings.long(SystemSettings.FLAT_SHIPPING_PAISE, 7_900)
        val total = subtotal - discount + shippingPaise

        val orderId = Ids.newId()
        val orderNumber = "TL-${System.currentTimeMillis()}-${(1..4).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString("")}"
        jdbc.sql(
            """
            insert into customer_order (id, order_number, customer_id, payment_method, is_bulk_order, is_b2b, shipping_address, billing_address,
                contact_email, contact_phone, subtotal_paise, discount_paise, coupon_id, coupon_code, shipping_paise, total_paise, gstin, notes, payment_due_by)
            values (:id, :num, :c, :method, :bulk, :b2b, cast(:ship as jsonb), cast(:bill as jsonb), :email, :phone, :sub, :disc, :coupon, :code,
                :shipping, :total, :gstin, :notes, :due)
            """.trimIndent(),
        )
            .param("id", orderId).param("num", orderNumber).param("c", customerId).param("method", req.paymentMethod.name)
            .param("bulk", lines.any { it.isBulkOrder }).param("b2b", customer.third == "BUSINESS")
            .param("ship", json.writeValueAsString(shipping)).param("bill", json.writeValueAsString(billing))
            .param("email", customer.first).param("phone", (shipping["phone"] as String?) ?: customer.second)
            .param("sub", subtotal).param("disc", discount).param("coupon", couponId).param("code", couponCode)
            .param("shipping", shippingPaise).param("total", total).param("gstin", shipping["gstin"]).param("notes", req.notes?.trim()?.ifEmpty { null })
            .param("due", if (req.paymentMethod == PaymentMethod.RAZORPAY) Timestamp.from(Instant.now().plus(PAYMENT_WINDOW)) else null)
            .update()

        split(orderId, orderNumber, lines, discount, shippingPaise)
        lines.forEach { takeStock(it, orderNumber) }
        couponId?.let { coupons.redeem(it, customerId, orderId, discount) }
        timeline(orderId, OrderStatus.PENDING.name, "Order placed", "customer", customerId)
        cart.clear(customerId)
        outbox.record(OrderTopics.PLACED, orderId.toString(), OrderPlaced(orderId, orderNumber, customerId, customer.first, total, req.paymentMethod))
        return view(orderId)
    }

    /** Seller orders and lines, with commission fixed at today's rates so later changes never rewrite history. */
    private fun split(orderId: UUID, orderNumber: String, lines: List<PricedLine>, discount: Long, shipping: Long) {
        val sellers = jdbc.sql("select id, is_platform, commission_rate_bp from seller where id = any(:ids)")
            .param("ids", lines.map { it.sellerId }.distinct().toTypedArray())
            .query { rs, _ -> rs.getObject("id", UUID::class.java) to (rs.getBoolean("is_platform") to rs.getObject("commission_rate_bp") as Int?) }
            .list().toMap()
        val resolver = finance.commissionResolver()
        val defaultBp = finance.defaultCommissionBp()
        val bySeller = lines.groupBy { it.sellerId }.entries.toList()
        val groups = bySeller.map { (sellerId, sellerLines) ->
            val (platform, override) = sellers.getValue(sellerId)
            OrderSplit.Group(sellerId, platform, sellerLines.map { OrderSplit.Line(it.lineTotalPaise, resolver.rateFor(platform, override, it.categoryId, defaultBp)) })
        }
        OrderSplit.allocate(groups, discount, shipping).forEachIndexed { i, a ->
            val sellerOrderId = Ids.newId()
            jdbc.sql(
                """
                insert into seller_order (id, order_number, order_id, seller_id, subtotal_paise, discount_paise, shipping_paise, total_paise,
                    commission_bp, commission_paise, payout_paise)
                values (:id, :num, :o, :s, :sub, :disc, :ship, :total, :bp, :comm, :payout)
                """.trimIndent(),
            )
                .param("id", sellerOrderId).param("num", OrderSplit.sellerOrderNumber(orderNumber, i)).param("o", orderId).param("s", a.sellerId)
                .param("sub", a.subtotalPaise).param("disc", a.discountPaise).param("ship", a.shippingPaise).param("total", a.totalPaise)
                .param("bp", a.commissionBp).param("comm", a.commissionPaise).param("payout", a.payoutPaise)
                .update()
            bySeller[i].value.forEachIndexed { j, l ->
                val la = a.lines[j]
                jdbc.sql(
                    """
                    insert into order_item (id, order_id, seller_order_id, seller_id, product_id, variant_id, name, sku, size, color, thumbnail,
                        quantity, unit_paise, discount_paise, commission_bp, commission_paise, customization, mockup_image)
                    values (:id, :o, :so, :s, :p, :v, :name, :sku, :size, :color, :thumb, :q, :unit, :disc, :bp, :comm, cast(:custom as jsonb), :mockup)
                    """.trimIndent(),
                )
                    .param("id", Ids.newId()).param("o", orderId).param("so", sellerOrderId).param("s", l.sellerId)
                    .param("p", l.productId).param("v", l.variantId).param("name", l.name).param("sku", l.sku)
                    .param("size", l.size).param("color", l.color).param("thumb", l.thumbnail).param("q", l.quantity)
                    .param("unit", l.unitPaise).param("disc", la.discountPaise).param("bp", la.rateBp).param("comm", la.commissionPaise)
                    .param("custom", l.customization?.let(json::writeValueAsString)).param("mockup", l.mockupImage)
                    .update()
            }
        }
    }

    /** Guarded decrement: two shoppers racing for the last unit cannot both get it. */
    private fun takeStock(line: PricedLine, orderNumber: String) {
        val taken = if (line.variantId != null) {
            jdbc.sql("update product_variant set quantity = quantity - :q, updated_at = now() where id = :v and quantity >= :q")
                .param("q", line.quantity).param("v", line.variantId).update().also {
                    // The product's own count is the total across its variants.
                    if (it == 1) jdbc.sql("update product set quantity = greatest(quantity - :q, 0), updated_at = now() where id = :p")
                        .param("q", line.quantity).param("p", line.productId).update()
                }
        } else {
            jdbc.sql("update product set quantity = quantity - :q, updated_at = now() where id = :p and quantity >= :q")
                .param("q", line.quantity).param("p", line.productId).update()
        }
        if (taken == 0) throw ConflictException("Insufficient stock for ${line.name}")
        movement(line.sellerId, line.productId, line.variantId, -line.quantity, "SALE", orderNumber)
    }

    private fun restock(orderId: UUID, sellerOrderId: UUID?, reason: String, reference: String) {
        val items = jdbc.sql("select seller_id, product_id, variant_id, quantity from order_item where order_id = :o and (cast(:so as uuid) is null or seller_order_id = :so)")
            .param("o", orderId).param("so", sellerOrderId)
            .query { rs, _ -> listOf(rs.getObject("seller_id", UUID::class.java), rs.getObject("product_id", UUID::class.java), rs.getObject("variant_id", UUID::class.java), rs.getInt("quantity")) }
            .list()
        for ((seller, product, variant, qty) in items) {
            jdbc.sql("update product set quantity = quantity + :q, updated_at = now() where id = :p").param("q", qty).param("p", product).update()
            if (variant != null) jdbc.sql("update product_variant set quantity = quantity + :q, updated_at = now() where id = :v").param("q", qty).param("v", variant).update()
            movement(seller as UUID, product as UUID, variant as UUID?, qty as Int, reason, reference)
        }
    }

    private fun movement(sellerId: UUID, productId: UUID, variantId: UUID?, delta: Int, reason: String, reference: String) {
        jdbc.sql("insert into inventory_movement (id, seller_id, product_id, variant_id, delta, reason, reference) values (:id, :s, :p, :v, :d, :r, :ref)")
            .param("id", Ids.newId()).param("s", sellerId).param("p", productId).param("v", variantId).param("d", delta).param("r", reason).param("ref", reference)
            .update()
    }

    // ================================================================ reading

    fun customerOrders(customerId: UUID, page: PageParams): Page<OrderSummaryView> = summaries("where o.customer_id = :c", mapOf("c" to customerId), page)

    fun customerOrder(customerId: UUID, idOrNumber: String): OrderView {
        val id = resolveId(idOrNumber)
        val owner = jdbc.sql("select customer_id from customer_order where id = :id").param("id", id).query(UUID::class.java).optional().orElse(null)
        // Someone else's order is "not found", never "forbidden": ids cannot be probed.
        if (owner != customerId) throw NotFoundException("Order not found")
        return view(id)
    }

    fun adminOrders(status: OrderStatus?, paymentStatus: PaymentStatus?, method: PaymentMethod?, query: String?, page: PageParams): Page<OrderSummaryView> {
        val where = buildString {
            append("where 1 = 1")
            if (status != null) append(" and o.status = :status")
            if (paymentStatus != null) append(" and o.payment_status = :pay")
            if (method != null) append(" and o.payment_method = :method")
            if (!query.isNullOrBlank()) append(" and (o.order_number ilike :q or o.contact_email ilike :q)")
        }
        val params = buildMap<String, Any> {
            status?.let { put("status", it.name) }; paymentStatus?.let { put("pay", it.name) }; method?.let { put("method", it.name) }
            if (!query.isNullOrBlank()) put("q", "%${query.trim()}%")
        }
        return summaries(where, params, page)
    }

    fun view(orderId: UUID): OrderView {
        val items = items("where order_id = :o", mapOf("o" to orderId))
        val parts = jdbc.sql(
            """
            select so.id, so.order_number, so.seller_id, s.shop_name, so.status, so.total_paise, so.tracking_number, so.carrier, so.shipped_at, so.delivered_at
            from seller_order so join seller s on s.id = so.seller_id where so.order_id = :o order by so.order_number
            """.trimIndent(),
        ).param("o", orderId).query { rs, _ ->
            SellerPartView(rs.getObject("id", UUID::class.java), rs.getString("order_number"), rs.getObject("seller_id", UUID::class.java),
                rs.getString("shop_name"), OrderStatus.valueOf(rs.getString("status")), rs.getLong("total_paise"), rs.getString("tracking_number"),
                rs.getString("carrier"), rs.getTimestamp("shipped_at")?.toInstant(), rs.getTimestamp("delivered_at")?.toInstant())
        }.list()
        val timeline = jdbc.sql("select status, message, created_at from order_timeline where order_id = :o order by created_at")
            .param("o", orderId).query { rs, _ -> TimelineView(rs.getString("status"), rs.getString("message"), rs.getTimestamp("created_at").toInstant()) }.list()
        val ret = jdbc.sql("select * from return_request where order_id = :o").param("o", orderId).query { rs, _ -> returnView(rs) }.optional().orElse(null)
        return jdbc.sql("select * from customer_order where id = :id").param("id", orderId).query { rs, _ ->
            OrderView(
                id = rs.getObject("id", UUID::class.java), orderNumber = rs.getString("order_number"), customerId = rs.getObject("customer_id", UUID::class.java),
                status = OrderStatus.valueOf(rs.getString("status")), paymentStatus = PaymentStatus.valueOf(rs.getString("payment_status")),
                paymentMethod = PaymentMethod.valueOf(rs.getString("payment_method")),
                shippingAddress = map(rs.getString("shipping_address")), billingAddress = map(rs.getString("billing_address")),
                contactEmail = rs.getString("contact_email"), subtotalPaise = rs.getLong("subtotal_paise"), discountPaise = rs.getLong("discount_paise"),
                couponCode = rs.getString("coupon_code"), taxPaise = rs.getLong("tax_paise"), shippingPaise = rs.getLong("shipping_paise"),
                totalPaise = rs.getLong("total_paise"), refundedPaise = rs.getLong("refunded_paise"), trackingNumber = rs.getString("tracking_number"),
                carrier = rs.getString("carrier"), deliveredAt = rs.getTimestamp("delivered_at")?.toInstant(), notes = rs.getString("notes"),
                adminNotes = rs.getString("admin_notes"), paymentDueBy = rs.getTimestamp("payment_due_by")?.toInstant(),
                createdAt = rs.getTimestamp("created_at").toInstant(), items = items, sellerOrders = parts, timeline = timeline, returnRequest = ret,
            )
        }.optional().orElseThrow { NotFoundException("Order not found") }
    }

    /** Public tracking: the order number and the email it was placed with must both match. */
    fun track(orderNumber: String, email: String): Map<String, Any?> {
        val id = jdbc.sql("select id from customer_order where order_number = :n and lower(contact_email) = lower(:e)")
            .param("n", orderNumber.trim()).param("e", email.trim()).query(UUID::class.java).optional()
            .orElseThrow { NotFoundException("We could not find an order with those details") }
        val o = view(id)
        return mapOf(
            "orderNumber" to o.orderNumber, "status" to o.status, "paymentStatus" to o.paymentStatus, "createdAt" to o.createdAt,
            "deliveredAt" to o.deliveredAt, "timeline" to o.timeline,
            "shipments" to o.sellerOrders.map { mapOf("status" to it.status, "trackingNumber" to it.trackingNumber, "carrier" to it.carrier, "shippedAt" to it.shippedAt, "deliveredAt" to it.deliveredAt) },
            "items" to o.items.map { mapOf("name" to it.name, "quantity" to it.quantity, "thumbnail" to it.thumbnail) },
        )
    }

    // ================================================================ status changes

    /** Staff move the whole order; every live shop follows (never backwards). */
    @Transactional
    fun staffStatus(adminId: UUID, orderId: UUID, update: StatusUpdate): OrderView {
        val o = state(orderId)
        OrderStatusRules.staffTransitionError(o.status, update.status)?.let { throw ConflictException(it) }
        if (update.status == OrderStatus.CANCELLED) return cancel(orderId, "admin", adminId, update.message ?: "Cancelled by TAILORAE")
        if (update.status == OrderStatus.RETURNED) return completeReturn(adminId, orderId, null, update.message)
        val subs = sellerStates(orderId)
        OrderStatusRules.cascade(update.status, subs, Instant.now()).forEach { writeSellerChange(it) }
        setParent(orderId, o, update.status, "admin", adminId, update.message ?: "Status changed to ${update.status}")
        if (update.trackingNumber != null || update.carrier != null) {
            jdbc.sql("update customer_order set tracking_number = coalesce(:t, tracking_number), carrier = coalesce(:c, carrier) where id = :id")
                .param("t", update.trackingNumber).param("c", update.carrier).param("id", orderId).update()
        }
        audit.record("admin", adminId, "STATUS_${update.status}", "customer_order", orderId.toString())
        return view(orderId)
    }

    /** A seller moves their own part. The parent follows once every shop has caught up. */
    @Transactional
    fun sellerStatus(sellerId: UUID, accountId: UUID, sellerOrderId: UUID, update: StatusUpdate) {
        val sub = jdbc.sql("select order_id, status, shipped_at, delivered_at, total_paise from seller_order where id = :id and seller_id = :s")
            .param("id", sellerOrderId).param("s", sellerId).query { rs, _ ->
                SubRow(rs.getObject("order_id", UUID::class.java), OrderStatus.valueOf(rs.getString("status")),
                    rs.getTimestamp("shipped_at")?.toInstant(), rs.getTimestamp("delivered_at")?.toInstant(), rs.getLong("total_paise"))
            }.optional().orElseThrow { NotFoundException("Order not found") }
        OrderStatusRules.sellerTransitionError(sub.status, update.status)?.let { throw ConflictException(it) }
        if (update.status == OrderStatus.SHIPPED && update.trackingNumber.isNullOrBlank() && !hasTracking(sellerOrderId)) {
            throw BadRequestException("Add the tracking number when you mark it shipped")
        }
        val (shipped, delivered) = OrderStatusRules.stamps(update.status, sub.shippedAt, sub.deliveredAt, Instant.now())
        jdbc.sql(
            """
            update seller_order set status = :st, shipped_at = coalesce(shipped_at, :shipped), delivered_at = coalesce(delivered_at, :delivered),
                tracking_number = coalesce(:t, tracking_number), carrier = coalesce(:c, carrier), updated_at = now()
            where id = :id
            """.trimIndent(),
        ).param("st", update.status.name).param("shipped", shipped?.let(Timestamp::from)).param("delivered", delivered?.let(Timestamp::from))
            .param("t", update.trackingNumber?.trim()).param("c", update.carrier?.trim()).param("id", sellerOrderId).update()

        val ref = jdbc.sql("select order_number from seller_order where id = :id").param("id", sellerOrderId).query(String::class.java).single()
        if (update.status == OrderStatus.CANCELLED) {
            restock(sub.orderId, sellerOrderId, "CANCEL", ref)
            timeline(sub.orderId, "SELLER_CANCELLED", "$ref was cancelled by the shop", "seller", accountId)
            if (state(sub.orderId).paymentStatus == PaymentStatus.PAID) {
                outbox.record(OrderTopics.REFUND_DUE, sub.orderId.toString(), RefundDue(sub.orderId, orderNumber(sub.orderId), sub.totalPaise, "Shop cancelled part of the order"))
            }
        }
        val parent = state(sub.orderId)
        val subStatuses = jdbc.sql("select status from seller_order where order_id = :o").param("o", sub.orderId).query(String::class.java).list().filterNotNull().map(OrderStatus::valueOf)
        OrderStatusRules.parentAfterSellerUpdate(parent.status, subStatuses)?.let { rolled ->
            if (rolled == OrderStatus.CANCELLED) {
                releaseCoupon(sub.orderId)
                // The refund for this last part was already raised above; the earlier parts raised theirs.
                setParent(sub.orderId, parent, rolled, "seller", accountId, "Every shop in this order cancelled", skipRefund = true)
            } else {
                setParent(sub.orderId, parent, rolled, "seller", accountId,
                    if (subStatuses.size > 1) "Status changed to $rolled — every shop in this order has reached it" else "Status changed to $rolled")
            }
        }
    }

    /** Customers may cancel until a shop starts packing. */
    @Transactional
    fun customerCancel(customerId: UUID, orderId: UUID): OrderView {
        val o = state(orderId)
        if (o.customerId != customerId) throw NotFoundException("Order not found")
        if (o.status != OrderStatus.PENDING && o.status != OrderStatus.CONFIRMED) {
            throw ConflictException("Order can no longer be cancelled (status: ${o.status})")
        }
        return cancel(orderId, "customer", customerId, "Order cancelled by customer")
    }

    /** Whole-order cancellation: every live shop, stock back, coupon use released, refund raised if paid. */
    @Transactional
    fun cancel(orderId: UUID, realm: String, actor: UUID?, message: String): OrderView {
        val o = state(orderId)
        if (OrderStatusRules.isVoid(o.status) || o.status == OrderStatus.DELIVERED) throw ConflictException("Order can no longer be cancelled (status: ${o.status})")
        val live = sellerStates(orderId).filterNot { OrderStatusRules.isVoid(it.status) }
        live.forEach { restock(orderId, it.id, "CANCEL", o.orderNumber) }
        OrderStatusRules.cascade(OrderStatus.CANCELLED, live, Instant.now()).forEach { writeSellerChange(it) }
        releaseCoupon(orderId)
        setParent(orderId, o, OrderStatus.CANCELLED, realm, actor, message)
        return view(orderId)
    }

    // ================================================================ returns

    @Transactional
    fun requestReturn(customerId: UUID, orderId: UUID, body: ReturnRequestBody): OrderView {
        val o = state(orderId)
        if (o.customerId != customerId) throw NotFoundException("Order not found")
        if (o.status != OrderStatus.DELIVERED) throw ConflictException("Only delivered orders can be returned")
        val window = settings.int(SystemSettings.SETTLEMENT_HOLD_DAYS, 7)
        val delivered = jdbc.sql("select delivered_at from customer_order where id = :id").param("id", orderId).query(Timestamp::class.java).optional().orElse(null)
        if (delivered != null && delivered.toInstant().isBefore(Instant.now().minus(Duration.ofDays(window.toLong())))) {
            throw ConflictException("The $window-day return window for this order has closed")
        }
        val type = body.requestType.uppercase()
        if (type !in setOf("RETURN", "EXCHANGE")) throw BadRequestException("requestType must be RETURN or EXCHANGE")
        val n = jdbc.sql(
            """
            insert into return_request (id, order_id, customer_id, request_type, reason, description, images)
            values (:id, :o, :c, :t, :r, :d, :img) on conflict (order_id) do nothing
            """.trimIndent(),
        ).param("id", Ids.newId()).param("o", orderId).param("c", customerId).param("t", type).param("r", body.reason.trim())
            .param("d", body.description?.trim()).param("img", body.images.toTypedArray()).update()
        if (n == 0) throw ConflictException("A return has already been requested for this order")
        timeline(orderId, if (type == "EXCHANGE") "EXCHANGE_REQUESTED" else "RETURN_REQUESTED", body.reason.trim(), "customer", customerId)
        return view(orderId)
    }

    fun returns(status: String?, page: PageParams): Page<Map<String, Any?>> {
        val total = jdbc.sql("select count(*) from return_request where (cast(:s as text) is null or status = :s)").param("s", status).query(Long::class.javaObjectType).single()
        val rows = jdbc.sql(
            """
            select r.*, o.order_number, o.total_paise, o.contact_email from return_request r join customer_order o on o.id = r.order_id
            where (cast(:s as text) is null or r.status = :s) order by r.created_at desc limit :l offset :off
            """.trimIndent(),
        ).param("s", status).param("l", page.safeLimit).param("off", page.offset).query { rs, _ ->
            mapOf("return" to returnView(rs), "orderId" to rs.getObject("order_id", UUID::class.java), "orderNumber" to rs.getString("order_number"),
                "orderTotalPaise" to rs.getLong("total_paise"), "customerEmail" to rs.getString("contact_email"))
        }.list()
        return Page(rows, total, page.safePage, page.safeLimit)
    }

    /** APPROVED / REJECTED, or COMPLETED: goods back → order RETURNED, stock restored, sellers reversed, refund raised. */
    @Transactional
    fun decideReturn(adminId: UUID, returnId: UUID, decision: ReturnDecision): OrderView {
        val (orderId, current) = jdbc.sql("select order_id, status from return_request where id = :id").param("id", returnId)
            .query { rs, _ -> rs.getObject("order_id", UUID::class.java) to rs.getString("status") }.optional()
            .orElseThrow { NotFoundException("Return not found") }
        if (current in setOf("REJECTED", "COMPLETED")) throw ConflictException("This return is already ${current.lowercase()}")
        when (decision.status) {
            "APPROVED", "REJECTED" -> {
                jdbc.sql("update return_request set status = :s, notes = coalesce(:n, notes), updated_at = now() where id = :id")
                    .param("s", decision.status).param("n", decision.notes).param("id", returnId).update()
                timeline(orderId, "RETURN_${decision.status}", decision.notes, "admin", adminId)
            }
            "COMPLETED" -> return completeReturn(adminId, orderId, decision.refundPaise, decision.notes)
            else -> throw BadRequestException("status must be APPROVED, REJECTED or COMPLETED")
        }
        audit.record("admin", adminId, "RETURN_${decision.status}", "return_request", returnId.toString())
        return view(orderId)
    }

    private fun completeReturn(adminId: UUID, orderId: UUID, refundPaise: Long?, notes: String?): OrderView {
        val o = state(orderId)
        if (o.status != OrderStatus.DELIVERED) throw ConflictException("Only a delivered order can be returned")
        val refundable = o.totalPaise - jdbc.sql("select refunded_paise from customer_order where id = :id").param("id", orderId).query(Long::class.javaObjectType).single()
        val amount = refundPaise ?: refundable
        if (amount < 0 || amount > refundable) throw BadRequestException("The refund can be at most ₹%.2f".format(refundable / 100.0))
        val subs = sellerStates(orderId)
        subs.filterNot { OrderStatusRules.isVoid(it.status) }.forEach { sub ->
            restock(orderId, sub.id, "RETURN", o.orderNumber)
            finance.postReturnReversal(sub.id, adminId)
        }
        OrderStatusRules.cascade(OrderStatus.RETURNED, subs, Instant.now()).forEach { writeSellerChange(it) }
        jdbc.sql(
            """
            insert into return_request (id, order_id, customer_id, reason, status, refund_paise, notes)
            values (:id, :o, :c, 'Returned to TAILORAE', 'COMPLETED', :amt, :n)
            on conflict (order_id) do update set status = 'COMPLETED', refund_paise = :amt, notes = coalesce(:n, return_request.notes), updated_at = now()
            """.trimIndent(),
        ).param("id", Ids.newId()).param("o", orderId).param("c", o.customerId).param("amt", amount).param("n", notes).update()
        setParent(orderId, o, OrderStatus.RETURNED, "admin", adminId, notes ?: "Return completed", refundOverride = amount)
        audit.record("admin", adminId, "RETURN_COMPLETED", "customer_order", orderId.toString(), after = mapOf("refundPaise" to amount))
        return view(orderId)
    }

    // ================================================================ seller views

    fun sellerOrders(sellerId: UUID, status: OrderStatus?, page: PageParams): Page<SellerOrderView> {
        val where = "where so.seller_id = :s and (cast(:st as text) is null or so.status = :st)"
        val total = jdbc.sql("select count(*) from seller_order so $where").param("s", sellerId).param("st", status?.name).query(Long::class.javaObjectType).single()
        val ids = jdbc.sql("select so.id from seller_order so $where order by so.created_at desc limit :l offset :o")
            .param("s", sellerId).param("st", status?.name).param("l", page.safeLimit).param("o", page.offset).query(UUID::class.java).list()
        return Page(ids.filterNotNull().map { sellerOrder(sellerId, it) }, total, page.safePage, page.safeLimit)
    }

    /** Reads only RLS-visible tables and the shipment view, so it is safe inside the seller scope. */
    fun sellerOrder(sellerId: UUID, sellerOrderId: UUID): SellerOrderView {
        val items = items("where seller_order_id = :so and seller_id = :s", mapOf("so" to sellerOrderId, "s" to sellerId))
        return jdbc.sql(
            """
            select so.*, sh.ship_name, sh.ship_line1, sh.ship_line2, sh.ship_city, sh.ship_state, sh.ship_postal_code, sh.payment_method, sh.notes
            from seller_order so join seller_order_shipment sh on sh.seller_order_id = so.id
            where so.id = :id and so.seller_id = :s
            """.trimIndent(),
        ).param("id", sellerOrderId).param("s", sellerId).query { rs, _ ->
            SellerOrderView(
                rs.getObject("id", UUID::class.java), rs.getString("order_number"), OrderStatus.valueOf(rs.getString("status")),
                rs.getString("payment_method"), rs.getLong("subtotal_paise"), rs.getLong("discount_paise"), rs.getLong("shipping_paise"),
                rs.getLong("total_paise"), rs.getLong("commission_paise"), rs.getLong("payout_paise"), rs.getString("tracking_number"),
                rs.getString("carrier"), rs.getTimestamp("shipped_at")?.toInstant(), rs.getTimestamp("delivered_at")?.toInstant(),
                rs.getTimestamp("settled_at")?.toInstant(), rs.getTimestamp("created_at").toInstant(),
                mapOf("name" to rs.getString("ship_name"), "line1" to rs.getString("ship_line1"), "line2" to rs.getString("ship_line2"),
                    "city" to rs.getString("ship_city"), "state" to rs.getString("ship_state"), "postalCode" to rs.getString("ship_postal_code")),
                rs.getString("notes"), items,
            )
        }.optional().orElseThrow { NotFoundException("Order not found") }
    }

    // ================================================================ helpers

    private data class OrderState(val customerId: UUID, val orderNumber: String, val status: OrderStatus, val paymentStatus: PaymentStatus, val method: PaymentMethod, val totalPaise: Long)

    private data class SubRow(val orderId: UUID, val status: OrderStatus, val shippedAt: Instant?, val deliveredAt: Instant?, val totalPaise: Long)

    private fun state(orderId: UUID): OrderState =
        jdbc.sql("select customer_id, order_number, status, payment_status, payment_method, total_paise from customer_order where id = :id for update")
            .param("id", orderId).query { rs, _ ->
                OrderState(rs.getObject("customer_id", UUID::class.java), rs.getString("order_number"), OrderStatus.valueOf(rs.getString("status")),
                    PaymentStatus.valueOf(rs.getString("payment_status")), PaymentMethod.valueOf(rs.getString("payment_method")), rs.getLong("total_paise"))
            }.optional().orElseThrow { NotFoundException("Order not found") }

    private fun sellerStates(orderId: UUID) =
        jdbc.sql("select id, status, shipped_at, delivered_at from seller_order where order_id = :o").param("o", orderId).query { rs, _ ->
            OrderStatusRules.SellerState(rs.getObject("id", UUID::class.java), OrderStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("shipped_at")?.toInstant(), rs.getTimestamp("delivered_at")?.toInstant())
        }.list()

    private fun writeSellerChange(c: OrderStatusRules.SellerChange) {
        jdbc.sql("update seller_order set status = :s, shipped_at = coalesce(shipped_at, :sh), delivered_at = coalesce(delivered_at, :d), updated_at = now() where id = :id")
            .param("s", c.status.name).param("sh", c.shippedAt?.let(Timestamp::from)).param("d", c.deliveredAt?.let(Timestamp::from)).param("id", c.id).update()
    }

    /** Sets the parent status, the payment status that follows from it, the timeline, and the events. */
    private fun setParent(orderId: UUID, o: OrderState, next: OrderStatus, realm: String, actor: UUID?, message: String,
                          refundOverride: Long? = null, skipRefund: Boolean = false) {
        val payment = OrderStatusRules.paymentAfter(next, o.method, o.paymentStatus)
        jdbc.sql(
            """
            update customer_order set status = :s, payment_status = coalesce(:p, payment_status),
                delivered_at = case when :s = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end, updated_at = now()
            where id = :id
            """.trimIndent(),
        ).param("s", next.name).param("p", payment?.name).param("id", orderId).update()
        timeline(orderId, next.name, message, realm, actor)
        val email = jdbc.sql("select contact_email from customer_order where id = :id").param("id", orderId).query(String::class.java).single()
        outbox.record(OrderTopics.STATUS_CHANGED, orderId.toString(), OrderStatusChanged(orderId, o.orderNumber, email, next))
        // A paid online order that is cancelled or returned owes the customer money; the payment module refunds it.
        if (!skipRefund && o.paymentStatus == PaymentStatus.PAID && o.method == PaymentMethod.RAZORPAY && payment == PaymentStatus.REFUNDED) {
            val refunded = jdbc.sql("select refunded_paise from customer_order where id = :id").param("id", orderId).query(Long::class.javaObjectType).single()
            val amount = refundOverride ?: (o.totalPaise - refunded)
            if (amount > 0) outbox.record(OrderTopics.REFUND_DUE, orderId.toString(), RefundDue(orderId, o.orderNumber, amount, message))
        }
    }

    private fun releaseCoupon(orderId: UUID) {
        val couponId = jdbc.sql("select coupon_id from customer_order where id = :id").param("id", orderId).query(UUID::class.java).optional().orElse(null) ?: return
        val removed = jdbc.sql("delete from coupon_redemption where order_id = :o").param("o", orderId).update()
        if (removed > 0) jdbc.sql("update coupon set usage_count = greatest(usage_count - 1, 0) where id = :c").param("c", couponId).update()
    }

    fun timeline(orderId: UUID, status: String, message: String?, realm: String, actor: UUID?) {
        jdbc.sql("insert into order_timeline (id, order_id, status, message, actor_realm, actor_id) values (:id, :o, :s, :m, :r, :a)")
            .param("id", Ids.newId()).param("o", orderId).param("s", status).param("m", message).param("r", realm).param("a", actor).update()
    }

    private fun hasTracking(sellerOrderId: UUID) =
        jdbc.sql("select tracking_number is not null from seller_order where id = :id").param("id", sellerOrderId).query(Boolean::class.javaObjectType).single()

    private fun orderNumber(orderId: UUID) = jdbc.sql("select order_number from customer_order where id = :id").param("id", orderId).query(String::class.java).single()

    private fun resolveId(idOrNumber: String): UUID =
        runCatching { UUID.fromString(idOrNumber) }.getOrNull()
            ?: jdbc.sql("select id from customer_order where order_number = :n").param("n", idOrNumber).query(UUID::class.java).optional()
                .orElseThrow { NotFoundException("Order not found") }

    private fun summaries(where: String, params: Map<String, Any>, page: PageParams): Page<OrderSummaryView> {
        val total = jdbc.sql("select count(*) from customer_order o $where").params(params).query(Long::class.javaObjectType).single()
        val rows = jdbc.sql(
            """
            select o.*, (select sum(quantity) from order_item i where i.order_id = o.id) as item_count,
                   (select name from order_item i where i.order_id = o.id order by i.created_at limit 1) as first_name,
                   (select thumbnail from order_item i where i.order_id = o.id order by i.created_at limit 1) as first_thumb
            from customer_order o $where order by o.created_at desc limit :lim offset :off
            """.trimIndent(),
        ).params(params).param("lim", page.safeLimit).param("off", page.offset).query { rs, _ ->
            OrderSummaryView(rs.getObject("id", UUID::class.java), rs.getString("order_number"), OrderStatus.valueOf(rs.getString("status")),
                PaymentStatus.valueOf(rs.getString("payment_status")), PaymentMethod.valueOf(rs.getString("payment_method")), rs.getLong("total_paise"),
                rs.getInt("item_count"), rs.getString("first_name"), rs.getString("first_thumb"), rs.getString("contact_email"),
                rs.getTimestamp("created_at").toInstant())
        }.list()
        return Page(rows, total, page.safePage, page.safeLimit)
    }

    private fun items(where: String, params: Map<String, Any>): List<OrderItemView> =
        jdbc.sql("select * from order_item $where order by created_at").params(params).query { rs, _ ->
            OrderItemView(rs.getObject("id", UUID::class.java), rs.getObject("product_id", UUID::class.java), rs.getObject("variant_id", UUID::class.java),
                rs.getObject("seller_id", UUID::class.java), rs.getString("name"), rs.getString("sku"), rs.getString("size"), rs.getString("color"),
                rs.getString("thumbnail"), rs.getInt("quantity"), rs.getLong("unit_paise"), rs.getLong("discount_paise"),
                rs.getString("customization")?.let { json.readValue(it, Any::class.java) }, rs.getString("mockup_image"))
        }.list()

    private fun returnView(rs: ResultSet) = ReturnView(
        rs.getObject("id", UUID::class.java), rs.getString("request_type"), rs.getString("reason"), rs.getString("description"),
        (rs.getArray("images")?.array as? Array<*>)?.filterIsInstance<String>().orEmpty(), rs.getString("status"),
        rs.getObject("refund_paise") as Long?, rs.getTimestamp("refunded_at")?.toInstant(), rs.getString("notes"), rs.getTimestamp("created_at").toInstant(),
    )

    @Suppress("UNCHECKED_CAST")
    private fun map(raw: String): Map<String, Any?> = json.readValue(raw, Map::class.java) as Map<String, Any?>

    private fun snapshot(a: AddressRequest): Map<String, Any?> = mapOf(
        "fullName" to a.fullName.trim(), "phone" to a.phone.trim(), "email" to a.email?.trim(), "line1" to a.line1.trim(),
        "line2" to a.line2?.trim(), "city" to a.city.trim(), "state" to a.state.trim(), "postalCode" to a.postalCode.trim(),
        "country" to a.country.uppercase(), "gstin" to a.gstin?.trim()?.uppercase()?.ifEmpty { null },
    )

    companion object {
        private const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        /** How long an unpaid online order holds its stock. */
        val PAYMENT_WINDOW: Duration = Duration.ofMinutes(30)
    }
}
