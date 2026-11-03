package com.tailorae.identity

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.MediaType
import org.springframework.security.config.annotation.web.HttpSecurityDsl
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@ConfigurationProperties("tailorae.web")
data class WebProperties(val origins: List<String> = listOf("http://localhost:3000"))

/**
 * One filter chain per realm. Each reads only its own access cookie and only
 * accepts tokens whose audience is that realm, so a customer token presented
 * to a seller route fails authentication outright.
 *
 * CSRF tokens are off because the API is JSON-only and cookies are
 * SameSite=Lax: a cross-site form cannot send `application/json`, and a
 * cross-site fetch that could is stopped by CORS, which only allows the web
 * origins listed in `tailorae.web.origins`.
 */
@Configuration
class SecurityConfig(private val tokens: TokenService, private val web: WebProperties) {

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder(12)

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource = UrlBasedCorsConfigurationSource().apply {
        registerCorsConfiguration(
            "/api/**",
            CorsConfiguration().apply {
                allowedOrigins = web.origins
                allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                allowedHeaders = listOf("Content-Type", "Accept")
                exposedHeaders = listOf("X-Total-Count")
                allowCredentials = true
                maxAge = 3600
            },
        )
    }

    @Bean
    @Order(1)
    fun sellerChain(http: HttpSecurity): SecurityFilterChain {
        http {
            securityMatcher("/api/seller/**")
            common(Realm.SELLER)
            authorizeHttpRequests {
                authorize("/api/seller/auth/register", permitAll)
                authorize("/api/seller/auth/login", permitAll)
                authorize("/api/seller/auth/refresh", permitAll)
                authorize("/api/seller/auth/logout", permitAll)
                authorize(anyRequest, authenticated)
            }
        }
        return http.build()
    }

    @Bean
    @Order(2)
    fun adminChain(http: HttpSecurity): SecurityFilterChain {
        http {
            securityMatcher("/api/admin/**")
            common(Realm.ADMIN)
            authorizeHttpRequests {
                authorize("/api/admin/auth/login", permitAll)
                authorize("/api/admin/auth/refresh", permitAll)
                authorize("/api/admin/auth/logout", permitAll)
                authorize(anyRequest, authenticated)
            }
        }
        return http.build()
    }

    /** Everything else: the storefront and customer accounts. Deny by default. */
    @Bean
    @Order(3)
    fun customerChain(http: HttpSecurity): SecurityFilterChain {
        http {
            common(Realm.CUSTOMER)
            authorizeHttpRequests {
                authorize("/actuator/health/**", permitAll)
                authorize("/actuator/health", permitAll)
                authorize("/api/auth/register", permitAll)
                authorize("/api/auth/login", permitAll)
                authorize("/api/auth/refresh", permitAll)
                authorize("/api/auth/logout", permitAll)
                authorize(anyRequest, authenticated)
            }
        }
        return http.build()
    }

    private fun HttpSecurityDsl.common(realm: Realm) {
        cors { configurationSource = corsConfigurationSource() }
        csrf { disable() }
        httpBasic { disable() }
        formLogin { disable() }
        sessionManagement { sessionCreationPolicy = SessionCreationPolicy.STATELESS }
        exceptionHandling {
            authenticationEntryPoint = jsonEntryPoint
            accessDeniedHandler = jsonAccessDenied
        }
        oauth2ResourceServer {
            bearerTokenResolver = cookieResolver(realm)
            authenticationEntryPoint = jsonEntryPoint
            jwt { jwtDecoder = tokens.decoderFor(realm) }
        }
    }

    /** The realm's access cookie; an `Authorization: Bearer` header also works for non-browser clients. */
    private fun cookieResolver(realm: Realm): BearerTokenResolver {
        val header = DefaultBearerTokenResolver()
        return BearerTokenResolver { request: HttpServletRequest ->
            request.cookies?.firstOrNull { it.name == realm.accessCookie }?.value?.takeIf { it.isNotBlank() }
                ?: header.resolve(request)
        }
    }

    private val jsonEntryPoint = AuthenticationEntryPoint { _, response, _ ->
        write(response, HttpServletResponse.SC_UNAUTHORIZED, "Please sign in")
    }

    private val jsonAccessDenied = AccessDeniedHandler { _, response, _ ->
        write(response, HttpServletResponse.SC_FORBIDDEN, "You do not have access to this")
    }

    private fun write(response: HttpServletResponse, status: Int, message: String) {
        response.status = status
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.writer.write("{\"success\":false,\"message\":\"$message\",\"data\":null}")
    }
}
