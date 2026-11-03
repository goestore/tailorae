package com.tailorae.identity

import com.tailorae.common.ApiResponse
import com.tailorae.common.NotFoundException
import com.tailorae.common.accountId
import jakarta.validation.Valid
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

data class CustomerProfileView(
    val id: UUID,
    val email: String,
    val firstName: String,
    val lastName: String,
    val phone: String?,
    val type: String,
    val emailVerified: Boolean,
    val marketingOptIn: Boolean,
    val createdAt: Instant,
)

data class CustomerProfileUpdate(
    @field:Size(min = 1, max = 80) val firstName: String? = null,
    @field:Size(max = 80) val lastName: String? = null,
    @field:Pattern(regexp = "^\\+?[0-9 ]{10,16}$", message = "must be a valid phone number") val phone: String? = null,
    val marketingOptIn: Boolean? = null,
)

@Service
class CustomerProfileService(private val customers: CustomerRepository) {

    @Transactional(readOnly = true)
    fun get(id: UUID): CustomerProfileView = view(find(id))

    /** Email is not changed here: that needs re-verification, a separate flow. */
    @Transactional
    fun update(id: UUID, req: CustomerProfileUpdate): CustomerProfileView {
        val c = find(id)
        req.firstName?.let { c.firstName = it.trim() }
        req.lastName?.let { c.lastName = it.trim() }
        req.phone?.let { c.phone = it.trim().ifEmpty { null } }
        req.marketingOptIn?.let { c.marketingOptIn = it }
        c.updatedAt = Instant.now()
        return view(customers.saveAndFlush(c))
    }

    /** A business profile makes the account a business account (docs/ACCOUNTS.md); called by the B2B module. */
    @Transactional
    fun markBusiness(id: UUID) {
        val c = find(id)
        if (c.type != "BUSINESS") {
            c.type = "BUSINESS"
            c.updatedAt = Instant.now()
            customers.saveAndFlush(c)
        }
    }

    private fun find(id: UUID) = customers.findById(id).orElseThrow { NotFoundException("Account not found") }

    private fun view(c: Customer) = CustomerProfileView(
        c.id, c.email, c.firstName, c.lastName, c.phone, c.type, c.emailVerifiedAt != null, c.marketingOptIn, c.createdAt,
    )
}

/** The legacy `/api/users/profile` path, so the account page keeps working. */
@RestController
@RequestMapping("/api/users/profile")
class CustomerProfileController(private val profiles: CustomerProfileService) {
    @GetMapping
    fun get(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("user" to profiles.get(jwt.accountId())))

    @PutMapping
    fun update(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: CustomerProfileUpdate) =
        ApiResponse.ok(mapOf("user" to profiles.update(jwt.accountId(), body)), "Profile updated")
}
