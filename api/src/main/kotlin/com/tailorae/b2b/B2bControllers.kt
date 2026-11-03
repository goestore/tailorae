package com.tailorae.b2b

import com.tailorae.common.ApiResponse
import com.tailorae.common.accountId
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.util.UUID

/** The buyer's wholesale desk. Every route is the signed-in customer's own data. */
@RestController
@RequestMapping("/api/b2b")
class B2bController(private val b2b: B2bService) {

    @GetMapping("/profile")
    fun profile(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any?>> {
        val me = jwt.accountId()
        val profile = b2b.profile(me)
        return ApiResponse.ok(mapOf("profile" to profile, "type" to b2b.customerType(me)), if (profile != null) "B2B profile fetched" else "No B2B profile yet")
    }

    /** Create or update. Created profiles always start unverified. */
    @PostMapping("/profile")
    fun save(@AuthenticationPrincipal jwt: Jwt, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, Any?>>> {
        val saved = b2b.saveProfile(jwt.accountId(), body)
        val message = when {
            saved.created -> "B2B profile created. Our team will verify it before wholesale pricing is unlocked."
            saved.verificationVoided -> "Profile updated. Your company details changed, so it will be verified again."
            else -> "B2B profile updated"
        }
        // `token` stays for the legacy client; nothing in the session changes any more.
        val data = mapOf("profile" to saved.profile, "token" to null)
        return ResponseEntity.status(if (saved.created) HttpStatus.CREATED else HttpStatus.OK).body(ApiResponse.ok(data, message))
    }

    @PostMapping("/rfq")
    fun rfq(@AuthenticationPrincipal jwt: Jwt, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val (rfq, created) = b2b.createRfq(jwt.accountId(), body)
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok(mapOf("rfq" to rfq, "profileCreated" to created), "Quote request received. Our B2B team will reply with pricing."),
        )
    }

    @GetMapping("/rfq")
    fun rfqs(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("rfqs" to b2b.myRfqs(jwt.accountId())), "RFQs fetched")

    @PatchMapping("/rfq/{id}/respond")
    fun respond(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, Any?>> {
        val decision = body?.get("decision")?.takeIf { it.isString }?.asString() ?: ""
        val (rfq, order) = b2b.respond(jwt.accountId(), id, decision)
        val message = if (order != null) "Quote accepted. Bulk order ${order.orderNumber} has been created." else "Quote declined."
        return ApiResponse.ok(mapOf("rfq" to rfq, "bulkOrder" to order), message)
    }

    @PostMapping("/bulk-orders")
    fun bulkOrder(@AuthenticationPrincipal jwt: Jwt, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, BulkOrderView>>> =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("bulkOrder" to b2b.createBulkOrder(jwt.accountId(), body)), "Bulk order created"))

    @GetMapping("/bulk-orders")
    fun bulkOrders(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("bulkOrders" to b2b.myBulkOrders(jwt.accountId())), "Bulk orders fetched")

    /** Trade credit: limit, used, available and the ledger. `credit` is null without a profile. */
    @GetMapping("/credit")
    fun credit(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("credit" to b2b.myCredit(jwt.accountId())), "Credit fetched")
}

/**
 * Staff wholesale desk. Quotes and bulk orders: SUPPORT; verifying a business:
 * KYC_REVIEW; the credit ledger: FINANCE.
 */
@RestController
@RequestMapping("/api/admin/b2b")
class AdminB2bController(private val admin: B2bAdminService, private val access: AdminAccess) {

    @GetMapping("/rfqs")
    fun rfqs(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
    ): ResponseEntity<ApiResponse<AdminRfqList>> {
        access.require(jwt, AdminPermission.SUPPORT)
        val result = admin.rfqs(status, page, limit)
        return ResponseEntity.ok().header("X-Total-Count", result.pagination.total.toString()).body(ApiResponse.ok(result, "RFQs fetched"))
    }

    @PatchMapping("/rfqs/{id}")
    fun decide(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, RfqView>> {
        val adminId = access.require(jwt, AdminPermission.SUPPORT)
        val rfq = admin.decideRfq(adminId, id, body)
        return ApiResponse.ok(mapOf("rfq" to rfq), if (rfq.status == "QUOTED") "Quote sent for ${rfq.rfqNumber}" else "${rfq.rfqNumber} declined")
    }

    @GetMapping("/profiles")
    fun profiles(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) verified: String?,
        @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
    ): ResponseEntity<ApiResponse<AdminProfileList>> {
        access.require(jwt, AdminPermission.SUPPORT, AdminPermission.KYC_REVIEW, AdminPermission.FINANCE)
        val result = admin.profiles(verified?.toBooleanStrictOrNull(), q, page, limit)
        return ResponseEntity.ok().header("X-Total-Count", result.pagination.total.toString()).body(ApiResponse.ok(result, "Profiles fetched"))
    }

    @PatchMapping("/profiles/{id}")
    fun updateProfile(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, AdminProfileView>> {
        val touchesCredit = body?.has("creditLimitPaise") == true
        val adminId = if (touchesCredit) access.require(jwt, AdminPermission.FINANCE) else access.require(jwt, AdminPermission.KYC_REVIEW)
        val view = admin.updateProfile(adminId, id, body)
        val message = when (body?.get("isVerified")?.takeIf { it.isBoolean }?.asBoolean()) {
            true -> "${view.profile.companyName} verified — wholesale pricing unlocked"
            false -> "${view.profile.companyName} marked unverified"
            null -> "${view.profile.companyName} updated"
        }
        return ApiResponse.ok(mapOf("profile" to view), message)
    }

    @GetMapping("/profiles/{id}/credit")
    fun credit(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, CreditView>> {
        access.require(jwt, AdminPermission.FINANCE)
        return ApiResponse.ok(mapOf("credit" to admin.credit(id)))
    }

    @PostMapping("/profiles/{id}/credit")
    fun recordCredit(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, CreditView>>> {
        val adminId = access.require(jwt, AdminPermission.FINANCE)
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("credit" to admin.recordCredit(adminId, id, body)), "Credit recorded"))
    }

    @GetMapping("/bulk-orders")
    fun bulkOrders(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
    ): ResponseEntity<ApiResponse<AdminBulkOrderList>> {
        access.require(jwt, AdminPermission.SUPPORT)
        val result = admin.bulkOrders(status, page, limit)
        return ResponseEntity.ok().header("X-Total-Count", result.pagination.total.toString()).body(ApiResponse.ok(result, "Bulk orders fetched"))
    }

    @PatchMapping("/bulk-orders/{id}")
    fun setStatus(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, BulkOrderView>> {
        val adminId = access.require(jwt, AdminPermission.SUPPORT)
        val order = admin.setBulkOrderStatus(adminId, id, body?.get("status")?.takeIf { it.isString }?.asString())
        return ApiResponse.ok(mapOf("bulkOrder" to order), "${order.orderNumber} is now ${order.status.lowercase()}")
    }
}
