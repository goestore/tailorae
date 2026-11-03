package com.tailorae.finance

import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.toResponse
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import com.tailorae.seller.SellerContext
import com.tailorae.seller.SellerPermission
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

private fun csvResponse(name: String, statement: Ledger.Statement): ResponseEntity<String> =
    ResponseEntity.ok()
        .contentType(MediaType("text", "csv", Charsets.UTF_8))
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$name\"")
        .body(Ledger.csv(statement))

/** The seller's money: balance, what is held and why, statements, withdrawals (FINANCE role). */
@RestController
class SellerFinanceController(private val finance: FinanceService, private val context: SellerContext) {
    @GetMapping("/api/seller/earnings")
    fun earnings(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(finance.sellerSummary(context.require(jwt, request, SellerPermission.FINANCE).sellerId))

    @GetMapping("/api/seller/earnings/statement")
    fun statement(
        @AuthenticationPrincipal jwt: Jwt,
        request: HttpServletRequest,
        @RequestParam(required = false) from: Instant?,
        @RequestParam(required = false) to: Instant?,
        @RequestParam(defaultValue = "json") format: String,
    ): ResponseEntity<*> {
        val seller = context.require(jwt, request, SellerPermission.FINANCE)
        val stmt = finance.sellerStatement(seller.sellerId, from, to)
        return if (format == "csv") csvResponse("statement.csv", stmt) else ResponseEntity.ok(ApiResponse.ok(stmt))
    }

    @GetMapping("/api/seller/withdrawals")
    fun withdrawals(
        @AuthenticationPrincipal jwt: Jwt,
        request: HttpServletRequest,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ) = finance.sellerWithdrawals(context.require(jwt, request, SellerPermission.FINANCE).sellerId, PageParams(page, limit)).toResponse()

    @PostMapping("/api/seller/withdrawals")
    fun requestWithdrawal(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @RequestBody(required = false) body: Map<String, Long?>?): ResponseEntity<ApiResponse<WithdrawalView>> {
        val seller = context.require(jwt, request, SellerPermission.FINANCE)
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(finance.requestWithdrawal(seller.sellerId, seller.accountId, body?.get("amountPaise")), "Withdrawal requested"))
    }
}

/** Staff payouts (FINANCE): balances, settling, adjustments, statements, withdrawal decisions. */
@RestController
class AdminFinanceController(private val finance: FinanceService, private val access: AdminAccess) {
    @GetMapping("/api/admin/payouts")
    fun balances(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
    ): ResponseEntity<ApiResponse<Page<SellerBalanceRow>>> {
        access.require(jwt, AdminPermission.FINANCE)
        return finance.balances(PageParams(page, limit)).toResponse()
    }

    @GetMapping("/api/admin/payouts/{sellerId}")
    fun seller(@AuthenticationPrincipal jwt: Jwt, @PathVariable sellerId: UUID): ApiResponse<EarningsSummary> {
        access.require(jwt, AdminPermission.FINANCE)
        return ApiResponse.ok(finance.adminSummary(sellerId))
    }

    @PostMapping("/api/admin/payouts/{sellerId}/settle")
    fun settle(@AuthenticationPrincipal jwt: Jwt, @PathVariable sellerId: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Long>> {
        val admin = access.require(jwt, AdminPermission.FINANCE)
        val reference = (body["reference"] as String?)?.ifBlank { null } ?: throw BadRequestException("Enter the bank transfer reference (UTR)")
        val balance = finance.settle(admin, sellerId, (body["amountPaise"] as Number?)?.toLong(), reference, body["note"] as String?)
        return ApiResponse.ok(mapOf("balancePaise" to balance), "Payout recorded")
    }

    @PostMapping("/api/admin/payouts/{sellerId}/adjustments")
    fun adjust(@AuthenticationPrincipal jwt: Jwt, @PathVariable sellerId: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Long>> {
        val admin = access.require(jwt, AdminPermission.FINANCE)
        val amount = (body["amountPaise"] as Number?)?.toLong() ?: throw BadRequestException("amountPaise is required")
        val balance = finance.adjust(admin, sellerId, amount, body["note"] as String? ?: "", body["reference"] as String?)
        return ApiResponse.ok(mapOf("balancePaise" to balance), "Adjustment posted")
    }

    @GetMapping("/api/admin/payouts/{sellerId}/statement")
    fun statement(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable sellerId: UUID,
        @RequestParam(required = false) from: Instant?,
        @RequestParam(required = false) to: Instant?,
        @RequestParam(defaultValue = "json") format: String,
    ): ResponseEntity<*> {
        access.require(jwt, AdminPermission.FINANCE)
        val stmt = finance.statement(sellerId, from, to)
        return if (format == "csv") csvResponse("statement-$sellerId.csv", stmt) else ResponseEntity.ok(ApiResponse.ok(stmt))
    }

    @GetMapping("/api/admin/withdrawals")
    fun withdrawals(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ): ResponseEntity<ApiResponse<Page<WithdrawalView>>> {
        access.require(jwt, AdminPermission.FINANCE)
        return finance.withdrawals(null, status?.uppercase(), PageParams(page, limit)).toResponse()
    }

    @PatchMapping("/api/admin/withdrawals/{id}")
    fun decide(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, String?>): ApiResponse<WithdrawalView> {
        val admin = access.require(jwt, AdminPermission.FINANCE)
        val status = body["status"]?.uppercase() ?: throw BadRequestException("status is required")
        return ApiResponse.ok(finance.decideWithdrawal(admin, id, status, body["transactionRef"], body["rejectionReason"]), "Withdrawal updated")
    }
}
