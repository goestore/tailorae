package com.tailorae.support

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.testcontainers.kafka.KafkaContainer
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.json.JsonMapper

/**
 * Base for every integration test: the whole application on a random port,
 * against real Postgres and Kafka.
 *
 * The containers start once per test JVM (not per class) and every subclass
 * shares one Spring context, so adding a test class costs seconds, not a fresh
 * broker. Tests must therefore not assume an empty database — create what you
 * need with unique emails/names (see [unique]).
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "tailorae.auth.jwt-secret=test-secret-test-secret-test-secret-0123456789",
        "tailorae.auth.secure-cookies=false",
        "tailorae.auth.bootstrap-admin-email=${IntegrationTest.ADMIN_EMAIL}",
        "tailorae.auth.bootstrap-admin-password=${IntegrationTest.ADMIN_PASSWORD}",
        "tailorae.outbox.poll-ms=200",
        "tailorae.storage.root=build/test-storage",
        // No calls to India Post from tests.
        "tailorae.delivery.pincode-lookup-url=",
        "tailorae.crypto.field-key=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        // The mail sender is a mock here, which the mail health check cannot inspect.
        "management.health.mail.enabled=false",
    ],
)
abstract class IntegrationTest {

    companion object {
        const val ADMIN_EMAIL = "root@tailorae.test"
        const val ADMIN_PASSWORD = "correct horse battery"
        const val PASSWORD = "linen kurta in saffron"

        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:15-alpine").apply { start() }
        val kafka: KafkaContainer = KafkaContainer("apache/kafka:4.3.2").apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun containers(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers)
        }

        private var counter = 0

        /** A value no other test has used in this JVM, e.g. `unique("asha")` → `asha-17-…`. */
        @Synchronized
        fun unique(prefix: String) = "$prefix-${++counter}-${System.nanoTime().toString(36)}"
    }

    @LocalServerPort
    protected var port: Int = 0

    @MockitoBean
    protected lateinit var mail: JavaMailSender

    @Autowired
    protected lateinit var jdbc: JdbcClient

    @Autowired
    protected lateinit var json: JsonMapper

    /** A fresh browser: its own cookie jar, nobody signed in. */
    protected fun anonymous() = TestClient(port, json)

    /** A new customer, signed in. */
    protected fun customer(name: String = unique("shopper")): TestClient = anonymous().apply {
        post("/api/auth/register", mapOf("email" to "$name@example.com", "password" to PASSWORD, "firstName" to name)).expect(201)
    }

    /** A new seller account (no business yet), signed in. */
    protected fun sellerAccount(name: String = unique("seller")): TestClient = anonymous().apply {
        val phone = "+91 9" + (100_000_000L + (System.nanoTime() % 899_999_999L)).toString().padStart(9, '0')
        post("/api/seller/auth/register", mapOf("email" to "$name@example.com", "password" to PASSWORD, "fullName" to name, "phone" to phone)).expect(201)
    }

    /** The bootstrap SUPER_ADMIN, signed in. */
    protected fun admin(): TestClient = anonymous().apply {
        post("/api/admin/auth/login", mapOf("email" to ADMIN_EMAIL, "password" to ADMIN_PASSWORD)).expect(200)
    }
}
