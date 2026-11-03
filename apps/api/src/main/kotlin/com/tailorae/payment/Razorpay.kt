package com.tailorae.payment

import com.tailorae.common.ApiException
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.time.Duration
import java.util.Base64
import java.util.HexFormat
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@ConfigurationProperties("tailorae.razorpay")
data class RazorpayProperties(
    val keyId: String = "",
    val keySecret: String = "",
    val webhookSecret: String = "",
    val baseUrl: String = "https://api.razorpay.com/v1",
) {
    val configured: Boolean get() = keyId.isNotBlank() && keySecret.isNotBlank()
}

data class GatewayPayment(val id: String, val orderId: String?, val amountPaise: Long, val status: String)

/** The calls TAILORAE makes to the payment gateway. Tests replace this; signatures are checked separately. */
interface PaymentGateway {
    fun createOrder(amountPaise: Long, receipt: String, notes: Map<String, String>): String
    fun fetchPayment(paymentId: String): GatewayPayment
    fun refund(paymentId: String, amountPaise: Long, notes: Map<String, String>): String
}

@Component
class RazorpayGateway(private val props: RazorpayProperties, private val json: JsonMapper) : PaymentGateway {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()

    override fun createOrder(amountPaise: Long, receipt: String, notes: Map<String, String>): String =
        call("POST", "/orders", mapOf("amount" to amountPaise, "currency" to "INR", "receipt" to receipt.take(40), "notes" to notes)).get("id").asString()

    override fun fetchPayment(paymentId: String): GatewayPayment = call("GET", "/payments/$paymentId", null).let {
        GatewayPayment(it.get("id").asString(), it.get("order_id")?.takeUnless { n -> n.isNull }?.asString(), it.get("amount").asLong(), it.get("status").asString())
    }

    override fun refund(paymentId: String, amountPaise: Long, notes: Map<String, String>): String =
        call("POST", "/payments/$paymentId/refund", mapOf("amount" to amountPaise, "notes" to notes)).get("id").asString()

    private fun call(method: String, path: String, body: Any?): JsonNode {
        if (!props.configured) throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Online payment is not available right now")
        val auth = Base64.getEncoder().encodeToString("${props.keyId}:${props.keySecret}".toByteArray())
        val req = HttpRequest.newBuilder(URI.create(props.baseUrl.trimEnd('/') + path))
            .timeout(Duration.ofSeconds(20))
            .header("Authorization", "Basic $auth")
            .header("Content-Type", "application/json")
            .method(method, body?.let { HttpRequest.BodyPublishers.ofString(json.writeValueAsString(it)) } ?: HttpRequest.BodyPublishers.noBody())
            .build()
        val res = http.send(req, HttpResponse.BodyHandlers.ofString())
        if (res.statusCode() !in 200..299) {
            throw ApiException(HttpStatus.BAD_GATEWAY, "The payment gateway refused the request — please try again")
        }
        return json.readTree(res.body())
    }
}

/** Razorpay's HMAC-SHA256 signatures — a port of legacy payment-signature.ts. */
object RazorpaySignatures {
    fun checkoutBody(gatewayOrderId: String, paymentId: String) = "$gatewayOrderId|$paymentId"

    fun hmacHex(message: ByteArray, secret: String): String {
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(), "HmacSHA256")) }
        return HexFormat.of().formatHex(mac.doFinal(message))
    }

    /** Constant-time, case-insensitive hex compare; anything not hex, empty, or of another length is false. */
    fun hexEquals(a: String?, b: String?): Boolean {
        if (a.isNullOrEmpty() || b.isNullOrEmpty() || a.length != b.length) return false
        val hex = Regex("^[0-9a-fA-F]+$")
        if (!hex.matches(a) || !hex.matches(b) || a.length % 2 != 0) return false
        return MessageDigest.isEqual(HexFormat.of().parseHex(a.lowercase()), HexFormat.of().parseHex(b.lowercase()))
    }

    fun checkoutValid(gatewayOrderId: String?, paymentId: String?, signature: String?, secret: String): Boolean {
        if (secret.isBlank() || gatewayOrderId.isNullOrBlank() || paymentId.isNullOrBlank() || signature.isNullOrBlank()) return false
        return hexEquals(hmacHex(checkoutBody(gatewayOrderId, paymentId).toByteArray(), secret), signature)
    }

    /** Over the raw request bytes exactly as received — never a re-serialised body. */
    fun webhookValid(rawBody: ByteArray?, signature: String?, secret: String): Boolean {
        if (secret.isBlank() || rawBody == null || rawBody.isEmpty() || signature.isNullOrBlank()) return false
        return hexEquals(hmacHex(rawBody, secret), signature)
    }
}

/** What a webhook body asks for — a port of legacy payment-webhook.ts `decideWebhookAction`. */
sealed interface WebhookAction {
    data class Capture(val payment: GatewayEntity) : WebhookAction
    data class Fail(val payment: GatewayEntity, val reason: String?) : WebhookAction
    data class Refund(val refundId: String, val paymentId: String, val amountPaise: Long, val notes: Map<String, String>, val payment: GatewayEntity?) : WebhookAction
    data class Ignore(val reason: String) : WebhookAction
}

data class GatewayEntity(val id: String, val orderId: String?, val amountPaise: Long, val notes: Map<String, String>, val errorDescription: String?)

object Webhooks {
    fun decide(body: JsonNode?): WebhookAction {
        if (body == null || !body.isObject) return WebhookAction.Ignore("body is not an object")
        val event = body.get("event")?.takeIf { it.isString }?.asString()?.ifBlank { null } ?: return WebhookAction.Ignore("event name missing")
        val payload = body.get("payload")
        return when (event) {
            "payment.captured", "payment.authorized" ->
                payment(payload)?.let { WebhookAction.Capture(it) } ?: WebhookAction.Ignore("$event carried no readable payment entity")
            "payment.failed" ->
                payment(payload)?.let { WebhookAction.Fail(it, it.errorDescription) } ?: WebhookAction.Ignore("$event carried no readable payment entity")
            "refund.processed" -> {
                val r = payload?.get("refund")?.get("entity")
                val id = r?.get("id")?.asString()
                val paymentId = r?.get("payment_id")?.asString()
                val amount = r?.get("amount")
                if (id.isNullOrBlank() || paymentId.isNullOrBlank() || amount == null || !amount.isNumber) WebhookAction.Ignore("$event carried no readable refund entity")
                else WebhookAction.Refund(id, paymentId, amount.asLong(), notes(r.get("notes")), payment(payload))
            }
            else -> WebhookAction.Ignore("unhandled event $event")
        }
    }

    /** Which order a gateway event is about: `notes.orderId`, else `notes.orderNumber`. */
    fun orderReference(action: WebhookAction): Pair<String, String>? {
        val noteSets = when (action) {
            is WebhookAction.Capture -> listOf(action.payment.notes)
            is WebhookAction.Fail -> listOf(action.payment.notes)
            is WebhookAction.Refund -> listOfNotNull(action.notes, action.payment?.notes)
            is WebhookAction.Ignore -> emptyList()
        }
        noteSets.firstNotNullOfOrNull { it["orderId"]?.ifBlank { null } }?.let { return "id" to it }
        noteSets.firstNotNullOfOrNull { it["orderNumber"]?.ifBlank { null } }?.let { return "orderNumber" to it }
        return null
    }

    private fun payment(payload: JsonNode?): GatewayEntity? {
        val e = payload?.get("payment")?.get("entity") ?: return null
        val id = e.get("id")?.asString()?.ifBlank { null } ?: return null
        val amount = e.get("amount")?.takeIf { it.isNumber }?.asLong() ?: return null
        return GatewayEntity(id, e.get("order_id")?.takeUnless { it.isNull }?.asString(), amount, notes(e.get("notes")),
            e.get("error_description")?.takeUnless { it.isNull }?.asString() ?: e.get("error_reason")?.takeUnless { it.isNull }?.asString())
    }

    private fun notes(node: JsonNode?): Map<String, String> =
        if (node == null || !node.isObject) emptyMap()
        else node.properties().associate { (k, v) -> k to (if (v.isString) v.asString() else v.toString()) }
}
