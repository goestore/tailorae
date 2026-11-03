package com.tailorae.common

import org.springframework.http.HttpMethod
import org.springframework.security.oauth2.jwt.Jwt
import java.util.UUID

/**
 * Extension points that let each module declare what it needs from the shared
 * configuration without editing it: its Kafka topics and its anonymous routes.
 * Declare them as `@Bean`s in the module; [KafkaTopicsConfig] and the security
 * chains collect every instance.
 */
data class TopicSet(val names: List<String>)

/** A route anyone may call, signed in or not. `method = null` means any method. */
data class PublicEndpoint(val method: HttpMethod?, val pattern: String)

data class PublicEndpoints(val endpoints: List<PublicEndpoint>) {
    companion object {
        fun get(vararg patterns: String) = PublicEndpoints(patterns.map { PublicEndpoint(HttpMethod.GET, it) })
    }
}

/** The account id carried in an access token's `sub` claim, whichever realm issued it. */
fun Jwt.accountId(): UUID = UUID.fromString(subject)
