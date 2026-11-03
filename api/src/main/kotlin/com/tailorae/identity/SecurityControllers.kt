package com.tailorae.identity

import com.tailorae.common.ApiResponse
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.PublicEndpoint
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.TopicSet
import com.tailorae.common.accountId
import com.tailorae.common.toResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.net.URI
import java.time.Instant
import java.util.UUID

@Configuration
class IdentityModuleConfig {
    @Bean
    fun identityTopics() = TopicSet(IdentityTopics.ALL)

    /** Reset and confirmation links are opened by someone not signed in. */
    @Bean
    fun identityPublicEndpoints() = PublicEndpoints(
        Realm.entries.flatMap { realm ->
            listOf(
                PublicEndpoint(HttpMethod.POST, "${realm.authPath}/forgot-password"),
                PublicEndpoint(HttpMethod.POST, "${realm.authPath}/reset-password"),
                PublicEndpoint(HttpMethod.GET, "${realm.authPath}/verify-email"),
                PublicEndpoint(HttpMethod.POST, "${realm.authPath}/verify-email"),
                PublicEndpoint(HttpMethod.GET, "${realm.authPath}/session"),
            )
        },
    )
}

data class EmailRequest(@field:NotBlank @field:Email val email: String)

data class ResetPasswordRequest(@field:NotBlank val token: String, @field:NotBlank val password: String)

data class ChangePasswordRequest(@field:NotBlank val currentPassword: String, @field:NotBlank val newPassword: String)

data class TokenRequest(@field:NotBlank val token: String)

/**
 * Password, email and device management, the same for every realm. Each realm
 * gets a thin subclass mounted at its own auth path (next to sign-in).
 */
abstract class RealmSecurityController(
    private val realm: Realm,
    protected val security: AccountSecurity,
    private val webUrl: String,
) {
    /**
     * "Am I signed in?" without a 401: `signedIn` when the access cookie is valid,
     * `refreshable` when it is not but a refresh cookie is present (call refresh, then me).
     */
    @GetMapping("/session")
    fun session(@AuthenticationPrincipal jwt: Jwt?, request: HttpServletRequest): ApiResponse<Map<String, Boolean>> {
        val refreshable = request.cookies?.any { it.name == realm.refreshCookie && it.value.isNotBlank() } == true
        return ApiResponse.ok(mapOf("signedIn" to (jwt != null), "refreshable" to (jwt == null && refreshable)))
    }

    @PostMapping("/forgot-password")
    fun forgot(@Valid @RequestBody body: EmailRequest, request: HttpServletRequest): ApiResponse<Unit> {
        security.requestPasswordReset(realm, body.email, request.remoteAddr)
        return ApiResponse(true, "If that email has an account, a reset link is on its way.")
    }

    @PostMapping("/reset-password")
    fun reset(@Valid @RequestBody body: ResetPasswordRequest): ApiResponse<Unit> {
        security.resetPassword(realm, body.token, body.password)
        return ApiResponse(true, "Your password has been changed. Sign in with the new one.")
    }

    @PostMapping("/change-password")
    fun change(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: ChangePasswordRequest): ApiResponse<Unit> {
        security.changePassword(realm, jwt.accountId(), family(jwt), body.currentPassword, body.newPassword)
        return ApiResponse(true, "Password changed. Your other devices have been signed out.")
    }

    /** The link in the email lands here, then on the web app's sign-in page with the outcome. */
    @GetMapping("/verify-email")
    fun verifyByLink(@RequestParam token: String): ResponseEntity<Unit> {
        val outcome = security.verifyEmail(realm, token)
        val page = if (realm == Realm.SELLER) "/seller/login" else "/auth/login"
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create("${webUrl.trimEnd('/')}$page?verified=$outcome")).build()
    }

    @PostMapping("/verify-email")
    fun verify(@Valid @RequestBody body: TokenRequest): ApiResponse<Map<String, String>> {
        val outcome = security.verifyEmail(realm, body.token)
        if (outcome == "invalid") throw BadRequestException("This confirmation link has expired or has already been used.")
        return ApiResponse.ok(mapOf("outcome" to outcome), "Your email address is confirmed")
    }

    @PostMapping("/verify-email/resend")
    fun resend(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Unit> {
        security.sendEmailVerification(realm, jwt.accountId())
        return ApiResponse(true, "We have sent you a new confirmation link")
    }

    @GetMapping("/verification")
    fun verification(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(security.verification(realm, jwt.accountId()))

    @GetMapping("/sessions")
    fun sessions(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(security.sessions(realm, jwt.accountId(), family(jwt)))

    @DeleteMapping("/sessions/{id}")
    fun revoke(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Unit> {
        security.revokeSession(realm, jwt.accountId(), id)
        return ApiResponse(true, "That device has been signed out")
    }

    @PostMapping("/sessions/revoke-others")
    fun revokeOthers(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Int>> =
        ApiResponse.ok(mapOf("signedOut" to security.revokeOthers(realm, jwt.accountId(), family(jwt))), "Your other devices have been signed out")

    private fun family(jwt: Jwt): UUID? = jwt.getClaimAsString("sfam")?.let { runCatching { UUID.fromString(it) }.getOrNull() }
}

@RestController
@RequestMapping("/api/auth")
class CustomerSecurityController(security: AccountSecurity, @Value("\${tailorae.mail.web-url:http://localhost:3000}") webUrl: String) :
    RealmSecurityController(Realm.CUSTOMER, security, webUrl)

@RestController
@RequestMapping("/api/seller/auth")
class SellerSecurityController(security: AccountSecurity, @Value("\${tailorae.mail.web-url:http://localhost:3000}") webUrl: String) :
    RealmSecurityController(Realm.SELLER, security, webUrl) {

    /** Sellers confirm their phone with a 6-digit code before they can submit their shop. */
    @PostMapping("/phone/send-code")
    fun sendCode(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Unit> {
        security.sendPhoneCode(jwt.accountId())
        return ApiResponse(true, "We have texted you a 6-digit code")
    }

    @PostMapping("/phone/verify")
    fun verifyPhone(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, String>): ApiResponse<Unit> {
        security.verifyPhone(jwt.accountId(), body["code"] ?: throw BadRequestException("Enter the code"))
        return ApiResponse(true, "Your phone number is confirmed")
    }
}

@RestController
@RequestMapping("/api/admin/auth")
class AdminSecurityController(security: AccountSecurity, @Value("\${tailorae.mail.web-url:http://localhost:3000}") webUrl: String) :
    RealmSecurityController(Realm.ADMIN, security, webUrl)

// ================================================================ staff management

data class StaffView(val id: UUID, val email: String, val fullName: String, val status: String, val permissions: Set<AdminPermission>, val createdAt: Instant)

data class StaffRequest(
    @field:NotBlank @field:Email val email: String,
    @field:NotBlank @field:Size(max = 120) val fullName: String,
    @field:NotBlank val password: String,
    val permissions: Set<AdminPermission>,
)

@Service
class StaffService(private val jdbc: JdbcClient, private val passwords: PasswordEncoder, private val access: AdminAccess, private val audit: Audit, private val sessions: AuthSessionRepository) {

    fun list(page: PageParams): Page<StaffView> {
        val total = jdbc.sql("select count(*) from admin_user").query(Long::class.javaObjectType).single()
        val ids = jdbc.sql("select id from admin_user order by created_at limit :l offset :o").param("l", page.safeLimit).param("o", page.offset).query(UUID::class.java).list()
        return Page(ids.filterNotNull().map(::get), total, page.safePage, page.safeLimit)
    }

    fun get(id: UUID): StaffView = jdbc.sql("select * from admin_user where id = :id").param("id", id).query { rs, _ ->
        StaffView(id, rs.getString("email"), rs.getString("full_name"), rs.getString("status"),
            jdbc.sql("select permission from admin_permission where admin_id = :id").param("id", id).query(String::class.java).list()
                .mapNotNull { p -> p?.let { runCatching { AdminPermission.valueOf(it) }.getOrNull() } }.toSet(),
            rs.getTimestamp("created_at").toInstant())
    }.optional().orElseThrow { NotFoundException("Staff member not found") }

    @Transactional
    fun create(actor: UUID, req: StaffRequest): StaffView {
        PasswordPolicy.check(req.password)
        if (req.permissions.isEmpty()) throw BadRequestException("Give at least one permission")
        val exists = jdbc.sql("select exists (select 1 from admin_user where lower(email) = lower(:e))").param("e", req.email.trim()).query(Boolean::class.javaObjectType).single()
        if (exists) throw ConflictException("A staff account with this email already exists")
        val id = Ids.newId()
        jdbc.sql("insert into admin_user (id, email, password_hash, full_name) values (:id, :e, :h, :n)")
            .param("id", id).param("e", req.email.trim().lowercase()).param("h", passwords.encode(req.password)!!).param("n", req.fullName.trim()).update()
        setPermissions(id, req.permissions)
        audit.record("admin", actor, "CREATE", "admin_user", id.toString(), after = mapOf("email" to req.email, "permissions" to req.permissions))
        return get(id)
    }

    @Transactional
    fun updatePermissions(actor: UUID, id: UUID, permissions: Set<AdminPermission>): StaffView {
        val before = get(id)
        if (id == actor && AdminPermission.SUPER_ADMIN in before.permissions && AdminPermission.SUPER_ADMIN !in permissions) {
            throw ConflictException("You cannot remove your own SUPER_ADMIN permission")
        }
        if (permissions.isEmpty()) throw BadRequestException("Give at least one permission")
        setPermissions(id, permissions)
        audit.record("admin", actor, "UPDATE", "admin_permission", id.toString(), before.permissions, permissions)
        return get(id)
    }

    @Transactional
    fun setStatus(actor: UUID, id: UUID, status: String): StaffView {
        if (status !in setOf("ACTIVE", "SUSPENDED")) throw BadRequestException("status must be ACTIVE or SUSPENDED")
        if (id == actor) throw ConflictException("You cannot suspend your own account")
        get(id)
        jdbc.sql("update admin_user set status = :s, updated_at = now() where id = :id").param("s", status).param("id", id).update()
        if (status == "SUSPENDED") sessions.revokeAllFor(Realm.ADMIN.audience, id, Instant.now())
        audit.record("admin", actor, "STATUS_$status", "admin_user", id.toString())
        return get(id)
    }

    private fun setPermissions(id: UUID, permissions: Set<AdminPermission>) {
        jdbc.sql("delete from admin_permission where admin_id = :id").param("id", id).update()
        permissions.forEach {
            jdbc.sql("insert into admin_permission (admin_id, permission) values (:id, :p)").param("id", id).param("p", it.name).update()
        }
    }
}

/** Only SUPER_ADMIN manages staff. */
@RestController
@RequestMapping("/api/admin/staff")
class StaffController(private val staff: StaffService, private val access: AdminAccess) {
    @GetMapping
    fun list(@AuthenticationPrincipal jwt: Jwt, @RequestParam(defaultValue = "1") page: Int, @RequestParam(defaultValue = "50") limit: Int): ResponseEntity<ApiResponse<Page<StaffView>>> {
        access.require(jwt, AdminPermission.SUPER_ADMIN)
        return staff.list(PageParams(page, limit)).toResponse()
    }

    @GetMapping("/me")
    fun me(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(staff.get(jwt.accountId()))

    @PostMapping
    fun create(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: StaffRequest) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(staff.create(access.require(jwt, AdminPermission.SUPER_ADMIN), body), "Staff account created"))

    @PutMapping("/{id}/permissions")
    fun permissions(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Set<AdminPermission>) =
        ApiResponse.ok(staff.updatePermissions(access.require(jwt, AdminPermission.SUPER_ADMIN), id, body), "Permissions saved")

    @PatchMapping("/{id}/status")
    fun status(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, String>) =
        ApiResponse.ok(staff.setStatus(access.require(jwt, AdminPermission.SUPER_ADMIN), id, body["status"] ?: ""), "Status saved")
}
