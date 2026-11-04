package com.tailorae.support

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import com.tailorae.payment.PaymentGateway
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
        "tailorae.razorpay.key-id=rzp_test_key",
        "tailorae.razorpay.key-secret=${IntegrationTest.RAZORPAY_SECRET}",
        "tailorae.razorpay.webhook-secret=${IntegrationTest.WEBHOOK_SECRET}",
        // No calls to India Post from tests.
        "tailorae.delivery.pincode-lookup-url=",
        "tailorae.crypto.field-key=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        // The mail sender is a mock here, which the mail health check cannot inspect.
        "management.health.mail.enabled=false",
        // Tests count rows and requests; no background traffic.
        "tailorae.warmup.enabled=false",
    ],
)
abstract class IntegrationTest {

    companion object {
        const val ADMIN_EMAIL = "root@tailorae.test"
        const val ADMIN_PASSWORD = "correct horse battery"
        const val PASSWORD = "linen kurta in saffron"
        const val RAZORPAY_SECRET = "test-razorpay-secret"
        const val WEBHOOK_SECRET = "test-webhook-secret"

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

    /** No real payment gateway in tests; signatures are still checked for real. */
    @MockitoBean
    protected lateinit var gateway: PaymentGateway

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

    /**
     * A new seller account (no business yet), signed in. Email and phone are
     * marked confirmed unless [verified] is false — the confirmation flows have
     * their own test.
     */
    protected fun sellerAccount(name: String = unique("seller"), verified: Boolean = true): TestClient = anonymous().apply {
        val phone = "+91 9" + (100_000_000L + (System.nanoTime() % 899_999_999L)).toString().padStart(9, '0')
        post("/api/seller/auth/register", mapOf("email" to "$name@example.com", "password" to PASSWORD, "fullName" to name, "phone" to phone)).expect(201)
        if (verified) {
            jdbc.sql("update seller_account set email_verified_at = now(), phone_verified_at = now() where lower(email) = lower(:e)")
                .param("e", "$name@example.com").update()
        }
    }

    /**
     * A seller business that staff have approved, with its owner signed in.
     * Returns the owner's client and the seller id.
     */
    protected fun approvedSeller(name: String = unique("Loom House")): Pair<TestClient, java.util.UUID> {
        val owner = sellerAccount()
        val shop = owner.post("/api/seller/business", mapOf(
            "shopName" to name, "legalName" to "$name Pvt Ltd", "businessType" to "PRIVATE_LIMITED", "pan" to "AAPFU0939F",
            "registeredAddress" to mapOf("line1" to "12 Linen Lane", "city" to "Jaipur", "state" to "Rajasthan", "postalCode" to "302001"),
            "contactPhone" to "+91 98290 12345",
        )).expect(201).data
        owner.upload("/api/seller/kyc/documents", mapOf("kind" to "PAN"), "file", "pan.pdf", "%PDF-1.4 test".toByteArray(), "application/pdf").expect(201)
        owner.put("/api/seller/bank", mapOf("accountName" to name, "accountNumber" to "123456789012", "ifsc" to "HDFC0001234")).expect(200)
        owner.post("/api/seller/business/submit").expect(200)
        val id = shop.get("id").asString()
        admin().post("/api/admin/sellers/$id/decision", mapOf("action" to "APPROVE")).expect(200)
        return owner to java.util.UUID.fromString(id)
    }

    /** The bootstrap SUPER_ADMIN, signed in. */
    protected fun admin(): TestClient = anonymous().apply {
        post("/api/admin/auth/login", mapOf("email" to ADMIN_EMAIL, "password" to ADMIN_PASSWORD)).expect(200)
    }
}
