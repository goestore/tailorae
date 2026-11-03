package com.tailorae.identity

import org.junit.jupiter.api.Test
import org.mockito.Mockito.atLeastOnce
import org.mockito.Mockito.timeout
import org.mockito.Mockito.verify
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.kafka.KafkaContainer
import org.testcontainers.postgresql.PostgreSQLContainer
import org.mockito.ArgumentMatchers.any
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The identity realms end to end, against real Postgres and Kafka:
 * registration → cookies → /me, realm isolation, refresh rotation with reuse
 * detection, lockout, admin bootstrap, and the outbox → Kafka → email path.
 */
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "tailorae.auth.jwt-secret=test-secret-test-secret-test-secret-0123456789",
        "tailorae.auth.secure-cookies=false",
        "tailorae.auth.bootstrap-admin-email=root@tailorae.test",
        "tailorae.auth.bootstrap-admin-password=correct horse battery",
        "tailorae.outbox.poll-ms=200",
        // The mail sender is a mock here, which the mail health check cannot inspect.
        "management.health.mail.enabled=false",
    ],
)
class IdentityIntegrationTest {

    companion object {
        @Container @ServiceConnection
        @JvmStatic
        val postgres = PostgreSQLContainer("postgres:15-alpine")

        @Container @ServiceConnection
        @JvmStatic
        val kafka = KafkaContainer("apache/kafka:4.3.2")
    }

    @Value("\${local.server.port}")
    private var port: Int = 0

    @MockitoBean
    private lateinit var mail: JavaMailSender

    private val http: HttpClient = HttpClient.newHttpClient()

    @Test
    fun `customer registers, is recognised, and gets a welcome email through Kafka`() {
        val res = post("/api/auth/register", """{"email":"Asha@Example.com","password":"linen kurta in saffron","firstName":"Asha"}""")
        assertEquals(201, res.statusCode(), res.body())
        val access = cookie(res, "tl_c")
        assertTrue(cookie(res, "tl_c_r").isNotEmpty())

        val me = get("/api/auth/me", "tl_c=$access")
        assertEquals(200, me.statusCode())
        assertTrue(me.body().contains("asha@example.com"), me.body())

        // Outbox row → relay → Kafka → notification consumer → mail.
        verify(mail, timeout(20_000).atLeastOnce()).send(any(SimpleMailMessage::class.java))
    }

    @Test
    fun `a duplicate email in the same realm is refused, but the seller realm is separate`() {
        val body = """{"email":"dup@example.com","password":"linen kurta in saffron","firstName":"Dup"}"""
        assertEquals(201, post("/api/auth/register", body).statusCode())
        assertEquals(409, post("/api/auth/register", body).statusCode())

        val seller = post(
            "/api/seller/auth/register",
            """{"email":"dup@example.com","password":"linen kurta in saffron","fullName":"Dup Seller","phone":"+91 98765 43210"}""",
        )
        assertEquals(201, seller.statusCode(), seller.body())
    }

    @Test
    fun `a token from one realm is rejected by another`() {
        val res = post("/api/auth/register", """{"email":"cross@example.com","password":"linen kurta in saffron","firstName":"Cross"}""")
        val customerToken = cookie(res, "tl_c")

        // Presented under the seller cookie name, and as a bearer header: both refused.
        assertEquals(401, get("/api/seller/auth/me", "tl_s=$customerToken").statusCode())
        val bearer = http.send(
            HttpRequest.newBuilder(url("/api/admin/auth/me")).header("Authorization", "Bearer $customerToken").GET().build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(401, bearer.statusCode())
    }

    @Test
    fun `refresh rotates, and reusing a rotated token revokes the whole session`() {
        val reg = post("/api/auth/register", """{"email":"rotate@example.com","password":"linen kurta in saffron","firstName":"Ro"}""")
        val first = cookie(reg, "tl_c_r")

        val r1 = post("/api/auth/refresh", "", "tl_c_r=$first")
        assertEquals(200, r1.statusCode(), r1.body())
        val second = cookie(r1, "tl_c_r")
        assertTrue(second != first)

        // The old token again: theft detected, family revoked…
        assertEquals(401, post("/api/auth/refresh", "", "tl_c_r=$first").statusCode())
        // …so even the legitimate newest token no longer works.
        assertEquals(401, post("/api/auth/refresh", "", "tl_c_r=$second").statusCode())
    }

    @Test
    fun `five wrong passwords lock the account`() {
        post("/api/auth/register", """{"email":"lock@example.com","password":"linen kurta in saffron","firstName":"Lo"}""")
        repeat(5) {
            assertEquals(401, post("/api/auth/login", """{"email":"lock@example.com","password":"wrong wrong wrong"}""").statusCode())
        }
        val locked = post("/api/auth/login", """{"email":"lock@example.com","password":"linen kurta in saffron"}""")
        assertEquals(423, locked.statusCode(), locked.body())
    }

    @Test
    fun `the bootstrap admin can sign in to the admin realm only`() {
        val creds = """{"email":"root@tailorae.test","password":"correct horse battery"}"""
        val res = post("/api/admin/auth/login", creds)
        assertEquals(200, res.statusCode(), res.body())
        assertEquals(200, get("/api/admin/auth/me", "tl_a=${cookie(res, "tl_a")}").statusCode())
        assertEquals(401, post("/api/auth/login", creds).statusCode())
    }

    // ------------------------------------------------------------ helpers

    private fun url(path: String) = URI.create("http://localhost:$port$path")

    private fun post(path: String, json: String, cookie: String? = null): HttpResponse<String> {
        val req = HttpRequest.newBuilder(url(path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
        cookie?.let { req.header("Cookie", it) }
        return http.send(req.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun get(path: String, cookie: String): HttpResponse<String> =
        http.send(HttpRequest.newBuilder(url(path)).header("Cookie", cookie).GET().build(), HttpResponse.BodyHandlers.ofString())

    private fun cookie(res: HttpResponse<String>, name: String): String =
        res.headers().allValues("set-cookie")
            .first { it.startsWith("$name=") }
            .substringAfter("$name=")
            .substringBefore(";")
}
