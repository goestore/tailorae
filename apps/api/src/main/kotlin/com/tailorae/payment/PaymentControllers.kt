package com.tailorae.payment

import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.PublicEndpoint
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.accountId
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@Configuration
class PaymentModuleConfig {
    @Bean
    fun paymentPublicEndpoints() = PublicEndpoints(
        listOf(
            PublicEndpoint(HttpMethod.GET, "/api/payments/config"),
            // Razorpay calls this; the HMAC over the raw body is the authentication.
            PublicEndpoint(HttpMethod.POST, "/api/payments/razorpay/webhook"),
        ),
    )
}

@RestController
@RequestMapping("/api/payments")
class PaymentController(private val payments: PaymentService) {
    @GetMapping("/config")
    fun config() = ApiResponse.ok(payments.config())

    @PostMapping("/razorpay/create-order")
    fun create(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, String>): ApiResponse<CheckoutSession> {
        val orderId = body["orderId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() } ?: throw BadRequestException("orderId is required")
        return ApiResponse.ok(payments.createSession(jwt.accountId(), orderId))
    }

    @PostMapping("/razorpay/verify")
    fun verify(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: VerifyRequest): ResponseEntity<ApiResponse<VerifyResult>> {
        val result = payments.verify(jwt.accountId(), body)
        return if (result.confirmed) {
            ResponseEntity.ok(ApiResponse.ok(result, "Payment confirmed"))
        } else {
            ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.ok(result, "Payment received and awaiting confirmation from the gateway. Your order will update shortly."))
        }
    }

    /** The raw bytes are read untouched: the signature is over exactly what Razorpay sent. */
    @PostMapping("/razorpay/webhook", consumes = ["application/json"])
    fun webhook(@RequestBody raw: ByteArray, @RequestHeader("X-Razorpay-Signature", required = false) signature: String?) =
        ApiResponse.ok(mapOf("result" to payments.webhook(raw, signature)))
}

@RestController
class AdminPaymentController(private val payments: PaymentService, private val access: AdminAccess) {
    @PostMapping("/api/admin/orders/{id}/refund")
    fun refund(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Long>> {
        val admin = access.require(jwt, AdminPermission.FINANCE)
        val amount = (body["amountPaise"] as Number?)?.toLong()
        val reason = (body["reason"] as String?)?.ifBlank { null } ?: throw BadRequestException("Give a reason for the refund")
        return ApiResponse.ok(mapOf("refundedPaise" to payments.refund(id, amount, reason, admin)), "Refund sent")
    }
}
