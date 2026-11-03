package com.tailorae.identity

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties("tailorae.auth")
data class AuthProperties(
    /** HS256 signing key. At least 32 bytes; the app refuses to start otherwise. */
    val jwtSecret: String,
    val accessTtl: Duration = Duration.ofMinutes(15),
    val refreshTtl: Duration = Duration.ofDays(30),
    /** `Secure` cookies. Off only for plain-http local development. */
    val secureCookies: Boolean = true,
    val maxFailedAttempts: Int = 5,
    val lockDuration: Duration = Duration.ofMinutes(15),
    /** First SUPER_ADMIN, created at startup only while no admin exists. */
    val bootstrapAdminEmail: String? = null,
    val bootstrapAdminPassword: String? = null,
) {
    init {
        require(jwtSecret.toByteArray().size >= 32) { "tailorae.auth.jwt-secret must be at least 32 bytes" }
    }
}
