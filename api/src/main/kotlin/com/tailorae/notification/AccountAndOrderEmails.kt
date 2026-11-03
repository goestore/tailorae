package com.tailorae.notification

import com.tailorae.common.ProcessedEvents
import com.tailorae.identity.AccountTokenIssued
import com.tailorae.identity.IdentityTopics
import com.tailorae.identity.PhoneOtpIssued
import com.tailorae.identity.Realm
import com.tailorae.order.OrderPaid
import com.tailorae.order.OrderPlaced
import com.tailorae.order.OrderService
import com.tailorae.order.OrderStatusChanged
import com.tailorae.order.OrderTopics
import com.tailorae.order.PaymentMethod
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.net.URLEncoder

@ConfigurationProperties("tailorae.sms")
data class SmsProperties(
    /** Empty until an SMS provider is chosen; codes are then only logged when [logCodes] is on (dev only). */
    val provider: String = "",
    val logCodes: Boolean = false,
)

/** Where texts go. One implementation per provider; the default only logs. */
fun interface SmsSender {
    fun send(phone: String, text: String)
}

@Component
class LoggingSmsSender(private val props: SmsProperties) : SmsSender {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun send(phone: String, text: String) {
        val masked = phone.takeLast(4).padStart(phone.length, '•')
        if (props.logCodes) log.info("SMS to {} (no provider configured): {}", masked, text)
        else log.warn("SMS to {} not sent: no SMS provider is configured (tailorae.sms.provider)", masked)
    }
}

/** Password reset, email confirmation and phone codes, for every realm. */
@Component
class AccountEmails(
    private val mailer: Mailer,
    private val sms: SmsSender,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
    private val props: MailProperties,
    @Value("\${tailorae.storage.public-base-url:http://localhost:8081}") private val apiUrl: String,
) {
    @KafkaListener(topics = [IdentityTopics.PASSWORD_RESET_REQUESTED], groupId = "notification")
    @Transactional
    fun onPasswordReset(message: String) {
        val (eventId, e) = json.envelope(message, AccountTokenIssued::class.java)
        if (!processed.firstTime("notification.password-reset", eventId)) return
        val page = if (e.realm == Realm.SELLER.audience) "/seller/reset-password" else "/auth/reset-password"
        val link = "${props.web}$page?token=${enc(e.token)}&realm=${e.realm}"
        mailer.send(e.email, EmailTemplates.passwordReset(firstName(e.name), link, e.expiresInMinutes.toInt()))
    }

    @KafkaListener(topics = [IdentityTopics.EMAIL_VERIFICATION_REQUESTED], groupId = "notification")
    @Transactional
    fun onEmailVerification(message: String) {
        val (eventId, e) = json.envelope(message, AccountTokenIssued::class.java)
        if (!processed.firstTime("notification.email-verification", eventId)) return
        // The link goes to the API, which confirms and then sends the browser on to the sign-in page.
        val authPath = Realm.entries.first { it.audience == e.realm }.authPath
        val link = "${apiUrl.trimEnd('/')}$authPath/verify-email?token=${enc(e.token)}"
        mailer.send(e.email, EmailTemplates.emailVerification(firstName(e.name), link, (e.expiresInMinutes / (24 * 60)).toInt().coerceAtLeast(1)))
    }

    @KafkaListener(topics = [IdentityTopics.PHONE_OTP_REQUESTED], groupId = "notification")
    @Transactional
    fun onPhoneCode(message: String) {
        val (eventId, e) = json.envelope(message, PhoneOtpIssued::class.java)
        if (!processed.firstTime("notification.phone-otp", eventId)) return
        sms.send(e.phone, "${e.code} is your TAILORAE code. It expires in ${e.expiresInMinutes} minutes. Never share it.")
    }

    private fun firstName(name: String) = name.trim().substringBefore(' ').ifBlank { null }

    private fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)
}

/** Order confirmations and status updates to the shopper. */
@Component
class OrderEmails(
    private val mailer: Mailer,
    private val orders: OrderService,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
    private val props: MailProperties,
) {
    /** Cash-on-delivery orders are confirmed when placed; online ones when the payment lands (below). */
    @KafkaListener(topics = [OrderTopics.PLACED], groupId = "notification")
    @Transactional
    fun onPlaced(message: String) {
        val (eventId, e) = json.envelope(message, OrderPlaced::class.java)
        if (!processed.firstTime("notification.order-placed", eventId)) return
        if (e.paymentMethod == PaymentMethod.COD) confirm(e.orderId, e.email)
    }

    @KafkaListener(topics = [OrderTopics.PAID], groupId = "notification")
    @Transactional
    fun onPaid(message: String) {
        val (eventId, e) = json.envelope(message, OrderPaid::class.java)
        if (!processed.firstTime("notification.order-paid", eventId)) return
        confirm(e.orderId, e.email)
    }

    @KafkaListener(topics = [OrderTopics.STATUS_CHANGED], groupId = "notification")
    @Transactional
    fun onStatusChanged(message: String) {
        val (eventId, e) = json.envelope(message, OrderStatusChanged::class.java)
        if (!processed.firstTime("notification.order-status", eventId)) return
        // The confirmation mail already covers CONFIRMED.
        if (e.status.name == "CONFIRMED" || e.status.name == "PENDING") return
        val order = orders.view(e.orderId)
        val shipment = order.sellerOrders.firstOrNull { it.trackingNumber != null }
        val mail = EmailTemplates.orderStatusUpdate(
            order.orderNumber, firstName(order), e.status.name, props.web,
            carrier = shipment?.carrier ?: order.carrier, trackingNumber = shipment?.trackingNumber ?: order.trackingNumber,
        ) ?: return
        mailer.send(e.email, mail)
    }

    private fun confirm(orderId: java.util.UUID, email: String) {
        val o = orders.view(orderId)
        val a = o.shippingAddress
        mailer.send(
            email,
            EmailTemplates.orderConfirmation(
                OrderMail(
                    orderId = o.id.toString(), orderNumber = o.orderNumber, firstName = firstName(o),
                    lines = o.items.map { OrderMailLine(it.name, it.quantity, it.unitPaise * it.quantity) },
                    subtotalPaise = o.subtotalPaise, discountPaise = o.discountPaise, discountCode = o.couponCode,
                    shippingPaise = o.shippingPaise, totalPaise = o.totalPaise,
                    address = OrderMailAddress(a["fullName"] as String, a["line1"] as String, a["line2"] as String?,
                        a["city"] as String, a["state"] as String, a["postalCode"] as String),
                ),
                props.web,
            ),
        )
    }

    private fun firstName(o: com.tailorae.order.OrderView) = (o.shippingAddress["fullName"] as String?)?.substringBefore(' ')
}
