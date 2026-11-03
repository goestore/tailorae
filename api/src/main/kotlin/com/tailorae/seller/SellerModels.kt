package com.tailorae.seller

import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

object SellerTopics {
    const val APPLICATION_SUBMITTED = "seller.application.submitted"
    const val APPLICATION_DECIDED = "seller.application.decided"
    const val MEMBER_INVITED = "seller.member.invited"

    val ALL = listOf(APPLICATION_SUBMITTED, APPLICATION_DECIDED, MEMBER_INVITED)
}

enum class BusinessType { INDIVIDUAL, PROPRIETORSHIP, PARTNERSHIP, LLP, PRIVATE_LIMITED, PUBLIC_LIMITED, OTHER }

enum class KycDocumentKind { PAN, GST_CERTIFICATE, ADDRESS_PROOF, CANCELLED_CHEQUE, OTHER }

data class PostalAddress(
    @field:NotBlank @field:Size(max = 200) val line1: String,
    @field:Size(max = 200) val line2: String? = null,
    @field:NotBlank @field:Size(max = 80) val city: String,
    @field:NotBlank @field:Size(max = 80) val state: String,
    @field:NotBlank @field:Pattern(regexp = "^[1-9][0-9]{5}$", message = "must be a 6-digit PIN code") val postalCode: String,
    @field:Size(max = 2) val country: String = "IN",
)

// ------------------------------------------------------------ requests

data class CreateBusinessRequest(
    @field:NotBlank @field:Size(max = 80) val shopName: String,
    @field:NotBlank @field:Size(max = 160) val legalName: String,
    val businessType: BusinessType,
    val pan: String? = null,
    val gstin: String? = null,
    @field:Valid val registeredAddress: PostalAddress? = null,
    @field:Valid val pickupAddress: PostalAddress? = null,
    @field:Pattern(regexp = "^\\+?[0-9 ]{10,16}$", message = "must be a valid phone number") val contactPhone: String? = null,
    @field:Email val contactEmail: String? = null,
    @field:Size(max = 2000) val shopDescription: String? = null,
)

/** Every field optional: only what is sent changes. Legal fields are refused once submitted. */
data class UpdateBusinessRequest(
    @field:Size(max = 80) val shopName: String? = null,
    @field:Size(max = 160) val legalName: String? = null,
    val businessType: BusinessType? = null,
    val pan: String? = null,
    val gstin: String? = null,
    @field:Valid val registeredAddress: PostalAddress? = null,
    @field:Valid val pickupAddress: PostalAddress? = null,
    @field:Pattern(regexp = "^\\+?[0-9 ]{10,16}$", message = "must be a valid phone number") val contactPhone: String? = null,
    @field:Email val contactEmail: String? = null,
    @field:Size(max = 2000) val shopDescription: String? = null,
    @field:Size(max = 500) val shopImage: String? = null,
    @field:Size(max = 500) val shopBanner: String? = null,
    val lowStockThreshold: Int? = null,
)

data class BankAccountRequest(
    @field:NotBlank @field:Size(max = 120) val accountName: String,
    @field:NotBlank @field:Pattern(regexp = "^[0-9]{9,18}$", message = "must be 9 to 18 digits") val accountNumber: String,
    @field:NotBlank val ifsc: String,
    @field:Size(max = 120) val bankName: String? = null,
)

data class InviteRequest(
    @field:NotBlank @field:Email val email: String,
    val role: SellerRole,
)

data class AcceptInviteRequest(@field:NotBlank val token: String)

data class DecisionRequest(
    val action: SellerAction,
    @field:Size(max = 1000) val note: String? = null,
)

data class CommissionRequest(val rateBp: Int?)

// ------------------------------------------------------------ views

data class ShopView(
    val id: UUID,
    val shopName: String,
    val shopSlug: String,
    val legalName: String?,
    val businessType: BusinessType?,
    val pan: String?,
    val gstin: String?,
    val registeredAddress: PostalAddress?,
    val pickupAddress: PostalAddress?,
    val contactPhone: String?,
    val contactEmail: String?,
    val shopDescription: String?,
    val shopImage: String?,
    val shopBanner: String?,
    val status: SellerStatus,
    val statusNote: String?,
    val commissionRateBp: Int?,
    val lowStockThreshold: Int,
    val rating: Double,
    val ratingCount: Int,
    val isPlatform: Boolean,
    val submittedAt: Instant?,
    val decidedAt: Instant?,
    val createdAt: Instant,
) {
    val canSell: Boolean get() = status == SellerStatus.APPROVED
}

data class MembershipView(val sellerId: UUID, val shopName: String, val role: SellerRole, val status: SellerStatus)

data class SellerMeView(
    val shop: ShopView?,
    val role: SellerRole?,
    val memberships: List<MembershipView>,
    /** What is still missing before the application can be submitted; empty when ready. */
    val checklist: List<String>,
    val applicationsOpen: Boolean,
)

data class KycDocumentView(
    val id: UUID,
    val kind: KycDocumentKind,
    val filename: String,
    val contentType: String,
    val bytes: Long,
    val createdAt: Instant,
)

data class BankAccountView(
    val accountName: String,
    val accountNumberMasked: String,
    val ifsc: String,
    val bankName: String?,
    val verified: Boolean,
    val updatedAt: Instant,
)

data class MemberView(val accountId: UUID, val fullName: String, val email: String, val role: SellerRole, val since: Instant)

data class InviteView(val id: UUID, val email: String, val role: SellerRole, val expiresAt: Instant, val createdAt: Instant)

data class StatusEventView(
    val fromStatus: String?,
    val toStatus: String,
    val note: String?,
    val actorRealm: String,
    val createdAt: Instant,
)

data class ReviewDocument(val document: KycDocumentView, val url: String)

/** What staff see when reviewing an application. Document links expire in minutes. */
data class SellerReviewView(
    val shop: ShopView,
    val owner: MemberView?,
    val documents: List<ReviewDocument>,
    val bank: BankAccountView?,
    val history: List<StatusEventView>,
    val allowedActions: Set<SellerAction>,
)

data class PublicShopView(
    val id: UUID,
    val shopName: String,
    val shopSlug: String,
    val shopDescription: String?,
    val shopImage: String?,
    val shopBanner: String?,
    val rating: Double,
    val ratingCount: Int,
    val since: Instant,
)

// ------------------------------------------------------------ events

data class ApplicationSubmitted(val sellerId: UUID, val shopName: String, val ownerEmail: String)

data class ApplicationDecided(
    val sellerId: UUID,
    val shopName: String,
    val ownerEmail: String,
    val status: SellerStatus,
    val note: String?,
)

data class MemberInvited(val sellerId: UUID, val shopName: String, val email: String, val role: SellerRole, val token: String)
