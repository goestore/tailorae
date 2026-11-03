package com.tailorae.engagement

import com.tailorae.b2b.CatalogFixtures
import com.tailorae.common.Outbox
import com.tailorae.notification.MailCapture
import com.tailorae.support.IntegrationTest
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.argThat
import org.mockito.Mockito.after
import org.mockito.Mockito.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.support.TransactionTemplate
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EngagementIntegrationTest : IntegrationTest() {

    @Autowired lateinit var outbox: Outbox
    @Autowired lateinit var tx: TransactionTemplate

    @Test
    fun `a contact message lands in the staff inbox`() {
        val subject = unique("Sizing question")
        anonymous().post("/api/contact", mapOf("name" to "Asha", "email" to "x", "subject" to subject, "message" to "Hi")).expect(400)
        val created = anonymous().post("/api/contact", mapOf("name" to "Asha", "email" to "Asha@Example.com", "subject" to subject, "message" to "Do you ship to Pune?"))
            .expect(201).data.get("request")
        assertEquals("asha@example.com", created.get("email").asString())
        assertEquals("OPEN", created.get("status").asString())

        val admin = admin()
        val inbox = admin.get("/api/admin/contact-requests").expect(200)
        assertTrue(inbox.data.get("requests").toString().contains(subject))
        assertNotNull(inbox.header("X-Total-Count"))
        val id = created.get("id").asString()
        admin.patch("/api/admin/contact-requests/$id", mapOf("status" to "DONE")).expect(400)
        assertEquals("RESOLVED", admin.patch("/api/admin/contact-requests/$id", mapOf("status" to "RESOLVED", "notes" to "Replied")).expect(200).data.get("request").get("status").asString())
        customer().get("/api/admin/contact-requests").expect(401)
    }

    @Test
    fun `newsletter sign-up is idempotent, unsubscribing needs the token, staff can export`() {
        val email = "${unique("reader")}@example.com"
        anonymous().post("/api/newsletter", mapOf("email" to "nope")).expect(400)
        anonymous().post("/api/newsletter", mapOf("email" to email.uppercase(), "source" to "homepage")).expect(201)
        anonymous().post("/api/newsletter", mapOf("email" to email, "source" to "footer")).expect(201) // no "already subscribed" leak

        val row = jdbc.sql("select source, unsubscribe_token from newsletter_subscriber where email = :e").param("e", email)
            .query { rs, _ -> rs.getString(1) to rs.getString(2) }.single()
        assertEquals("homepage", row.first, "the first touchpoint is kept")

        anonymous().post("/api/newsletter/unsubscribe", mapOf("token" to "guess")).expect(404)
        anonymous().post("/api/newsletter/unsubscribe", mapOf("token" to row.second)).expect(200)

        val admin = admin()
        val listed = admin.get("/api/admin/newsletter-subscribers").expect(200).data.get("subscribers").toString()
        assertTrue(listed.contains(email) && !listed.contains(row.second), "listed, token never exposed")
        assertTrue(!admin.get("/api/admin/newsletter-subscribers/export").expect(200).body.contains(email), "unsubscribed are left out")

        val id = jdbc.sql("select id from newsletter_subscriber where email = :e").param("e", email).query(UUID::class.java).single()
        admin.patch("/api/admin/newsletter-subscribers/$id", mapOf("isSubscribed" to true)).expect(200)
        val csv = admin.get("/api/admin/newsletter-subscribers/export").expect(200)
        assertTrue(csv.header("Content-Type")!!.startsWith("text/csv"))
        assertTrue(csv.body.lines().first() == "email,source,is_subscribed,subscribed_at,unsubscribed_at")
        assertTrue(csv.body.contains("$email,homepage,true"))
    }

    @Test
    fun `a restock emails each waiting shopper exactly once`() {
        val product = CatalogFixtures.product(jdbc, unique("restock").lowercase())
        val sizeM = "${unique("size-m")}@example.com"
        val anySize = "${unique("any")}@example.com"
        val otherSize = "${unique("other")}@example.com"
        val shop = anonymous()
        shop.post("/api/stock-notify", mapOf("productId" to product.id.toString(), "variantId" to product.variantId.toString(), "email" to sizeM)).expect(201)
        shop.post("/api/stock-notify", mapOf("productId" to product.id.toString(), "variantId" to product.variantId.toString(), "email" to sizeM)).expect(201)
        shop.post("/api/stock-notify", mapOf("productId" to product.id.toString(), "email" to anySize)).expect(201)
        shop.post("/api/stock-notify", mapOf("productId" to UUID.randomUUID().toString(), "email" to otherSize)).expect(404)
        shop.post("/api/stock-notify", mapOf("productId" to product.id.toString(), "variantId" to UUID.randomUUID().toString(), "email" to otherSize)).expect(404)
        assertEquals(2L, jdbc.sql("select count(*) from stock_notification where product_id = :p").param("p", product.id).query(Long::class.javaObjectType).single())

        // Staff see the waiting list, outstanding first.
        assertTrue(admin().get("/api/admin/stock-notifications").expect(200).data.get("notifications").toString().contains(sizeM))

        val restock = mapOf("productId" to product.id.toString(), "variantId" to product.variantId.toString(), "quantity" to 12)
        tx.execute { outbox.record(EngagementTopics.STOCK_CHANGED, product.id.toString(), restock) }

        val mailM = MailCapture.await(mail, sizeM, "Back in stock").single()
        assertTrue(MailCapture.text(mailM).contains("${product.name} in M is available again."), MailCapture.text(mailM))
        assertTrue(MailCapture.text(mailM).contains("/products/${product.slug}"))
        MailCapture.await(mail, anySize, "Back in stock")

        // A second stock change does not mail the same people again.
        tx.execute { outbox.record(EngagementTopics.STOCK_CHANGED, product.id.toString(), restock) }
        verify(mail, after(4_000).times(1)).send(MailCapture.to(sizeM))
        val notified = jdbc.sql("select notified_at is not null from stock_notification where email = :e").param("e", sizeM).query(Boolean::class.javaObjectType).single()
        assertTrue(notified)

        // Signing up again re-arms the request for the next restock.
        shop.post("/api/stock-notify", mapOf("productId" to product.id.toString(), "variantId" to product.variantId.toString(), "email" to sizeM)).expect(201)
        assertEquals(false, jdbc.sql("select notified_at is not null from stock_notification where email = :e").param("e", sizeM).query(Boolean::class.javaObjectType).single())
    }

    @Test
    fun `a stock change to zero claims nobody`() {
        val product = CatalogFixtures.product(jdbc, unique("still-out").lowercase())
        val email = "${unique("waiting")}@example.com"
        anonymous().post("/api/stock-notify", mapOf("productId" to product.id.toString(), "email" to email)).expect(201)
        tx.execute { outbox.record(EngagementTopics.STOCK_CHANGED, product.id.toString(), mapOf("productId" to product.id.toString(), "quantity" to 0)) }
        verify(mail, after(4_000).never()).send(MailCapture.to(email))
        assertEquals(false, jdbc.sql("select notified_at is not null from stock_notification where email = :e").param("e", email).query(Boolean::class.javaObjectType).single())
    }
}
