package com.tailorae.identity

import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * Tokens travel only in httpOnly cookies — script on the page can never read
 * them. The access cookie goes to every API call; the refresh cookie is
 * path-scoped to its realm's auth endpoints, so it is sent nowhere else.
 */
@Component
class AuthCookies(private val props: AuthProperties) {

    fun issue(realm: Realm, tokens: IssuedTokens): List<String> = listOf(
        cookie(realm.accessCookie, tokens.accessToken, "/", props.accessTtl),
        cookie(realm.refreshCookie, tokens.refreshToken, realm.authPath, props.refreshTtl),
    )

    fun clear(realm: Realm): List<String> = listOf(
        cookie(realm.accessCookie, "", "/", Duration.ZERO),
        cookie(realm.refreshCookie, "", realm.authPath, Duration.ZERO),
    )

    private fun cookie(name: String, value: String, path: String, maxAge: Duration) =
        ResponseCookie.from(name, value)
            .httpOnly(true)
            .secure(props.secureCookies)
            .sameSite("Lax")
            .path(path)
            .maxAge(maxAge)
            .build()
            .toString()
}

data class IssuedTokens(val accessToken: String, val refreshToken: String)
