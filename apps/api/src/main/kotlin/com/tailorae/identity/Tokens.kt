package com.tailorae.identity

import com.nimbusds.jose.jwk.source.ImmutableSecret
import com.nimbusds.jose.proc.SecurityContext
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator
import org.springframework.security.oauth2.jose.jws.MacAlgorithm
import org.springframework.security.oauth2.jwt.JwsHeader
import org.springframework.security.oauth2.jwt.JwtClaimNames
import org.springframework.security.oauth2.jwt.JwtClaimValidator
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtEncoderParameters
import org.springframework.security.oauth2.jwt.JwtValidators
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder
import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.spec.SecretKeySpec

/**
 * Access tokens are short-lived JWTs whose audience names the realm; refresh
 * tokens are opaque random strings stored only as a SHA-256 hash.
 */
@Component
class TokenService(private val props: AuthProperties) {
    private val key = SecretKeySpec(props.jwtSecret.toByteArray(), "HmacSHA256")
    private val encoder = NimbusJwtEncoder(ImmutableSecret<SecurityContext>(key))
    private val random = SecureRandom()

    fun accessToken(realm: Realm, accountId: UUID, sessionFamily: UUID, now: Instant = Instant.now()): String {
        val claims = JwtClaimsSet.builder()
            .issuer("tailorae")
            .subject(accountId.toString())
            .audience(listOf(realm.audience))
            .issuedAt(now)
            .expiresAt(now.plus(props.accessTtl))
            .claim("sfam", sessionFamily.toString())
            .build()
        val header = JwsHeader.with(MacAlgorithm.HS256).build()
        return encoder.encode(JwtEncoderParameters.from(header, claims)).tokenValue
    }

    /** A decoder that accepts only tokens minted for [realm]. */
    fun decoderFor(realm: Realm): JwtDecoder =
        NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build().apply {
            setJwtValidator(
                DelegatingOAuth2TokenValidator(
                    JwtValidators.createDefaultWithIssuer("tailorae"),
                    JwtClaimValidator<List<String>>(JwtClaimNames.AUD) { aud -> aud?.contains(realm.audience) == true },
                ),
            )
        }

    fun newRefreshToken(): String = ByteArray(32).also(random::nextBytes).let {
        Base64.getUrlEncoder().withoutPadding().encodeToString(it)
    }

    fun hash(refreshToken: String): String =
        MessageDigest.getInstance("SHA-256").digest(refreshToken.toByteArray()).joinToString("") { "%02x".format(it) }
}
