package com.tailorae.identity

import com.tailorae.common.ApiResponse
import com.tailorae.common.UnauthorizedException
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class LoginRequest(
    @field:NotBlank @field:Email val email: String,
    @field:NotBlank val password: String,
)

data class CustomerRegisterRequest(
    @field:NotBlank @field:Email @field:Size(max = 254) val email: String,
    @field:NotBlank val password: String,
    @field:NotBlank @field:Size(max = 80) val firstName: String,
    @field:Size(max = 80) val lastName: String = "",
    @field:Pattern(regexp = "^\\+?[0-9 ]{10,16}$", message = "must be a valid phone number") val phone: String? = null,
    val marketingOptIn: Boolean = false,
)

data class SellerRegisterRequest(
    @field:NotBlank @field:Email @field:Size(max = 254) val email: String,
    @field:NotBlank val password: String,
    @field:NotBlank @field:Size(max = 120) val fullName: String,
    @field:NotBlank @field:Pattern(regexp = "^\\+?[0-9 ]{10,16}$", message = "must be a valid phone number") val phone: String,
)

/**
 * The endpoints every realm shares — sign in, refresh, sign out, who am I.
 * Each realm's controller is a thin subclass that fixes the [realm].
 */
abstract class RealmAuthController(
    protected val realm: Realm,
    protected val auth: AuthService,
    protected val cookies: AuthCookies,
) {
    @PostMapping("/login")
    fun login(@Valid @RequestBody body: LoginRequest, request: HttpServletRequest) =
        respond(HttpStatus.OK, "Signed in", auth.login(realm, body.email, body.password, client(request)))

    @PostMapping("/refresh")
    fun refresh(request: HttpServletRequest): ResponseEntity<ApiResponse<AccountSummary>> {
        val token = request.cookies?.firstOrNull { it.name == realm.refreshCookie }?.value
            ?: throw UnauthorizedException("Your session has ended — please sign in again")
        return respond(HttpStatus.OK, "Session refreshed", auth.refresh(realm, token, client(request)))
    }

    @PostMapping("/logout")
    fun logout(request: HttpServletRequest): ResponseEntity<ApiResponse<Unit>> {
        auth.logout(realm, request.cookies?.firstOrNull { it.name == realm.refreshCookie }?.value)
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, *cookies.clear(realm).toTypedArray())
            .body(ApiResponse(true, "Signed out"))
    }

    @GetMapping("/me")
    fun me(@AuthenticationPrincipal jwt: Jwt) =
        ApiResponse.ok(auth.me(realm, UUID.fromString(jwt.subject)))

    protected fun respond(status: HttpStatus, message: String, result: AuthResult): ResponseEntity<ApiResponse<AccountSummary>> =
        ResponseEntity.status(status)
            .header(HttpHeaders.SET_COOKIE, *cookies.issue(realm, result.tokens).toTypedArray())
            .body(ApiResponse.ok(result.account, message))

    protected fun client(request: HttpServletRequest) =
        ClientInfo(request.getHeader(HttpHeaders.USER_AGENT), request.remoteAddr)
}

@RestController
@RequestMapping("/api/auth")
class CustomerAuthController(auth: AuthService, cookies: AuthCookies) : RealmAuthController(Realm.CUSTOMER, auth, cookies) {
    @PostMapping("/register")
    fun register(@Valid @RequestBody body: CustomerRegisterRequest, request: HttpServletRequest) =
        respond(
            HttpStatus.CREATED,
            "Welcome to TAILORAE",
            auth.registerCustomer(body.email, body.password, body.firstName, body.lastName, body.phone, body.marketingOptIn, client(request)),
        )
}

@RestController
@RequestMapping("/api/seller/auth")
class SellerAuthController(auth: AuthService, cookies: AuthCookies) : RealmAuthController(Realm.SELLER, auth, cookies) {
    @PostMapping("/register")
    fun register(@Valid @RequestBody body: SellerRegisterRequest, request: HttpServletRequest) =
        respond(
            HttpStatus.CREATED,
            "Seller account created",
            auth.registerSeller(body.email, body.password, body.fullName, body.phone, client(request)),
        )
}

/** No self-registration: staff accounts are created by a SUPER_ADMIN. */
@RestController
@RequestMapping("/api/admin/auth")
class AdminAuthController(auth: AuthService, cookies: AuthCookies) : RealmAuthController(Realm.ADMIN, auth, cookies)
