package com.tailorae.seller

import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.PageParams
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.SystemSettings
import com.tailorae.common.TopicSet
import com.tailorae.common.accountId
import com.tailorae.common.toResponse
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import com.tailorae.identity.Realm
import com.tailorae.identity.AuthService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.util.UUID

@Configuration
class SellerModuleConfig {
    @Bean
    fun sellerTopics() = TopicSet(SellerTopics.ALL)

    @Bean
    fun sellerPublicEndpoints() = PublicEndpoints.get("/api/seller/applications-open", "/api/sellers", "/api/sellers/*")
}

/** The seller's own console: business profile, application, KYC, bank, team. */
@RestController
@RequestMapping("/api/seller")
class SellerController(
    private val sellers: SellerService,
    private val context: SellerContext,
    private val settings: SystemSettings,
    private val auth: AuthService,
) {
    @GetMapping("/applications-open")
    fun applicationsOpen() = ApiResponse.ok(mapOf("open" to settings.bool(SystemSettings.SELLER_APPLICATIONS_OPEN, true)))

    @GetMapping("/me")
    fun me(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest): ApiResponse<SellerMeView> {
        val account = jwt.accountId()
        return ApiResponse.ok(sellers.me(account, context.current(jwt, request), context.memberships(account)))
    }

    @PostMapping("/business")
    fun create(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: CreateBusinessRequest) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(sellers.createBusiness(jwt.accountId(), body), "Shop created"))

    @PutMapping("/business")
    fun update(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @Valid @RequestBody body: UpdateBusinessRequest) =
        ApiResponse.ok(sellers.updateBusiness(context.require(jwt, request, SellerPermission.PROFILE), body), "Saved")

    @PostMapping("/business/submit")
    fun submit(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(sellers.submit(context.require(jwt, request, SellerPermission.PROFILE)), "Application submitted")

    // ------------------------------------------------------------ KYC

    @GetMapping("/kyc/documents")
    fun documents(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(sellers.listDocuments(context.require(jwt, request, SellerPermission.PROFILE)))

    @PostMapping("/kyc/documents", consumes = ["multipart/form-data"])
    fun upload(
        @AuthenticationPrincipal jwt: Jwt,
        request: HttpServletRequest,
        @RequestParam kind: KycDocumentKind,
        @RequestPart file: MultipartFile,
    ): ResponseEntity<ApiResponse<KycDocumentView>> {
        val seller = context.require(jwt, request, SellerPermission.PROFILE)
        val doc = sellers.uploadDocument(seller, kind, file.originalFilename ?: "document", file.contentType ?: "", file.bytes)
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(doc, "Document uploaded"))
    }

    @DeleteMapping("/kyc/documents/{id}")
    fun deleteDocument(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID): ApiResponse<Unit> {
        sellers.deleteDocument(context.require(jwt, request, SellerPermission.PROFILE), id)
        return ApiResponse(true, "Document removed")
    }

    @GetMapping("/kyc/documents/{id}/url")
    fun documentUrl(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID) =
        ApiResponse.ok(mapOf("url" to sellers.documentUrl(context.require(jwt, request, SellerPermission.PROFILE), id)))

    // ------------------------------------------------------------ bank

    @GetMapping("/bank")
    fun bank(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(sellers.getBank(context.require(jwt, request, SellerPermission.PROFILE)))

    @PutMapping("/bank")
    fun saveBank(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @Valid @RequestBody body: BankAccountRequest) =
        ApiResponse.ok(sellers.saveBank(context.require(jwt, request, SellerPermission.PROFILE), body), "Bank account saved")

    // ------------------------------------------------------------ team

    @GetMapping("/members")
    fun members(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest): ApiResponse<Map<String, Any>> {
        val (members, invites) = sellers.members(context.require(jwt, request, SellerPermission.VIEW))
        return ApiResponse.ok(mapOf("members" to members, "invites" to invites))
    }

    @PostMapping("/members/invites")
    fun invite(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @Valid @RequestBody body: InviteRequest) =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(sellers.invite(context.require(jwt, request, SellerPermission.MEMBERS), body), "Invite sent"))

    @DeleteMapping("/members/invites/{id}")
    fun revokeInvite(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID): ApiResponse<Unit> {
        sellers.revokeInvite(context.require(jwt, request, SellerPermission.MEMBERS), id)
        return ApiResponse(true, "Invite withdrawn")
    }

    @DeleteMapping("/members/{accountId}")
    fun removeMember(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable accountId: UUID): ApiResponse<Unit> {
        sellers.removeMember(context.require(jwt, request, SellerPermission.MEMBERS), accountId)
        return ApiResponse(true, "Member removed")
    }

    /** Any signed-in seller account can accept an invite addressed to its email. */
    @PostMapping("/invites/accept")
    fun accept(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: AcceptInviteRequest): ApiResponse<MembershipView> {
        val account = auth.me(Realm.SELLER, jwt.accountId())
        return ApiResponse.ok(sellers.acceptInvite(account.id, account.email, body.token), "You have joined the shop")
    }
}

/** Staff review of seller applications (KYC_REVIEW) and commission (FINANCE). */
@RestController
@RequestMapping("/api/admin/sellers")
class AdminSellerController(
    private val sellers: SellerService,
    private val access: AdminAccess,
    private val settings: SystemSettings,
) {
    @GetMapping
    fun list(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: SellerStatus?,
        @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ): ResponseEntity<ApiResponse<com.tailorae.common.Page<ShopView>>> {
        // Moderators need the list for the "Sold by" pickers; the review detail stays KYC_REVIEW.
        access.require(jwt, AdminPermission.KYC_REVIEW, AdminPermission.SUPPORT, AdminPermission.FINANCE, AdminPermission.MODERATOR)
        return sellers.adminList(status, q, PageParams(page, limit)).toResponse()
    }

    @GetMapping("/{id}")
    fun detail(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<SellerReviewView> {
        access.require(jwt, AdminPermission.KYC_REVIEW)
        return ApiResponse.ok(sellers.adminDetail(id))
    }

    @PostMapping("/{id}/decision")
    fun decide(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @Valid @RequestBody body: DecisionRequest): ApiResponse<ShopView> {
        val admin = access.require(jwt, AdminPermission.KYC_REVIEW)
        return ApiResponse.ok(sellers.decide(admin, id, body), "Decision saved")
    }

    @PutMapping("/{id}/commission")
    fun commission(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: CommissionRequest): ApiResponse<ShopView> {
        val admin = access.require(jwt, AdminPermission.FINANCE)
        return ApiResponse.ok(sellers.setCommission(admin, id, body.rateBp), "Commission saved")
    }

    @PutMapping("/applications-open")
    fun setApplicationsOpen(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Boolean>): ApiResponse<Map<String, Boolean>> {
        access.require(jwt, AdminPermission.KYC_REVIEW)
        val open = body["open"] ?: throw BadRequestException("open: must be true or false")
        settings.set(SystemSettings.SELLER_APPLICATIONS_OPEN, open)
        return ApiResponse.ok(mapOf("open" to open), if (open) "Seller sign-ups are open" else "Seller sign-ups are closed")
    }
}

/** The public shop directory. */
@RestController
@RequestMapping("/api/sellers")
class ShopDirectoryController(private val sellers: SellerService) {
    @GetMapping
    fun list(
        @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "24") limit: Int,
    ) = sellers.directory(q, PageParams(page, limit)).toResponse()

    @GetMapping("/{slug}")
    fun shop(@PathVariable slug: String) = ApiResponse.ok(sellers.publicShop(slug))
}
