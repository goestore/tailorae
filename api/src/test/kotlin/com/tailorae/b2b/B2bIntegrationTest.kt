package com.tailorae.b2b

import com.tailorae.support.IntegrationTest
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class B2bIntegrationTest : IntegrationTest() {

    private fun customerId(email: String): UUID =
        jdbc.sql("select id from customer where lower(email) = lower(:e)").param("e", email).query(UUID::class.java).single()

    @Test
    fun `a business buyer asks for a quote, staff price it, the buyer accepts it into a bulk order`() {
        val product = CatalogFixtures.product(jdbc, unique("b2b").lowercase(), pricePaise = 120_000)
        val name = unique("buyer")
        val buyer = customer(name)
        val buyerId = customerId("$name@example.com")

        assertTrue(buyer.get("/api/b2b/profile").expect(200).data.get("profile").isNull)
        buyer.post("/api/b2b/profile", mapOf("panNumber" to "AAPFU0939F")).expect(400).also { assertEquals("Company name is required", it.message) }
        buyer.post("/api/b2b/profile", mapOf("companyName" to "Loom", "panNumber" to "ABCDE1234F", "gstNumber" to "27AAPFU0939F1ZV"))
            .expect(400).also { assertEquals("GSTIN does not belong to this PAN", it.message) }

        val profile = buyer.post("/api/b2b/profile", mapOf("companyName" to "Loom Co", "businessType" to "Retailer", "monthlyBudgetPaise" to 10_000_000)).expect(201).data.get("profile")
        assertFalse(profile.get("isVerified").asBoolean())
        assertEquals(10_000_000, profile.get("monthlyBudgetPaise").asLong())
        // Same login, now a business account (docs/ACCOUNTS.md).
        assertEquals("BUSINESS", buyer.get("/api/b2b/profile").expect(200).data.get("type").asString())
        assertEquals("BUSINESS", jdbc.sql("select type from customer where id = :id").param("id", buyerId).query(String::class.java).single())

        buyer.post("/api/b2b/rfq", mapOf("productId" to product.id.toString(), "quantity" to 0)).expect(400)
        val rfq = buyer.post(
            "/api/b2b/rfq",
            mapOf("productId" to product.id.toString(), "productName" to "Custom kurta", "quantity" to 200, "targetPricePaise" to 90_000, "description" to "Navy, embroidered"),
        ).expect(201).data.get("rfq")
        assertEquals("PENDING", rfq.get("status").asString())
        assertEquals("Product: Custom kurta — Navy, embroidered", rfq.get("specialRequirements").asString())
        assertEquals(product.name, rfq.get("product").get("name").asString())
        val rfqId = rfq.get("id").asString()

        buyer.patch("/api/b2b/rfq/$rfqId/respond", mapOf("decision" to "accept")).expect(409).also { assertEquals("This request has not been quoted yet", it.message) }
        // Someone else's RFQ is not found, never forbidden.
        customer().patch("/api/b2b/rfq/$rfqId/respond", mapOf("decision" to "accept")).expect(404)

        val admin = admin()
        val pending = admin.get("/api/admin/b2b/rfqs?status=PENDING").expect(200).data
        assertTrue(pending.get("counts").get("PENDING").asInt() >= 1)
        assertTrue(pending.get("rfqs").toString().contains(rfqId))
        admin.patch("/api/admin/b2b/rfqs/$rfqId", mapOf("status" to "QUOTED", "quotedPricePaise" to 0)).expect(400)
        admin.patch("/api/admin/b2b/rfqs/$rfqId", mapOf("status" to "REJECTED")).expect(400)
        val quoted = admin.patch("/api/admin/b2b/rfqs/$rfqId", mapOf("status" to "QUOTED", "quotedPricePaise" to 95_000, "notes" to "Includes embroidery")).expect(200).data.get("rfq")
        assertEquals("QUOTED", quoted.get("status").asString())
        assertEquals("Loom Co", quoted.get("b2bProfile").get("companyName").asString())
        assertTrue(quoted.get("expiryDate").isString, "defaults to 14 days")

        val mine = buyer.get("/api/b2b/rfq").expect(200).data.get("rfqs").get(0)
        assertEquals(95_000, mine.get("quotedPricePaise").asLong())
        assertTrue(mine.get("quotedBy") == null || mine.get("quotedBy").isNull, "the admin id is internal")

        val accepted = buyer.patch("/api/b2b/rfq/$rfqId/respond", mapOf("decision" to "accept")).expect(200)
        val order = accepted.data.get("bulkOrder")
        assertEquals(95_000, order.get("unitPricePaise").asLong())
        assertEquals(19_000_000, order.get("totalPricePaise").asLong())
        assertTrue(accepted.message.startsWith("Quote accepted. Bulk order BO-"))
        buyer.patch("/api/b2b/rfq/$rfqId/respond", mapOf("decision" to "reject")).expect(409)
        admin.patch("/api/admin/b2b/rfqs/$rfqId", mapOf("status" to "QUOTED", "quotedPricePaise" to 1)).expect(409)
        assertEquals(1, buyer.get("/api/b2b/bulk-orders").expect(200).data.get("bulkOrders").size())

        val orderId = order.get("id").asString()
        admin.patch("/api/admin/b2b/bulk-orders/$orderId", mapOf("status" to "CONFIRMED")).expect(200)
        admin.patch("/api/admin/b2b/bulk-orders/$orderId", mapOf("status" to "CONFIRMED")).expect(400)
    }

    @Test
    fun `wholesale bulk orders wait for verification, then price from the quantity breaks`() {
        val product = CatalogFixtures.product(jdbc, unique("bulk").lowercase(), pricePaise = 100_000)
        CatalogFixtures.bulkTier(jdbc, product.id, 50, 80_000)
        val name = unique("trader")
        val buyer = customer(name)
        val id = customerId("$name@example.com")
        buyer.post("/api/b2b/bulk-orders", mapOf("productId" to product.id.toString(), "quantity" to 60)).expect(400) // no profile yet
        buyer.post("/api/b2b/profile", mapOf("companyName" to "Trader Co", "panNumber" to "AAPFU0939F", "gstNumber" to "27AAPFU0939F1ZV")).expect(201)
        buyer.post("/api/b2b/bulk-orders", mapOf("productId" to product.id.toString(), "quantity" to 60)).expect(403)

        val admin = admin()
        val listed = admin.get("/api/admin/b2b/profiles?verified=false&q=Trader").expect(200).data
        assertTrue(listed.get("profiles").toString().contains(id.toString()))
        val verified = admin.patch("/api/admin/b2b/profiles/$id", mapOf("isVerified" to true)).expect(200)
        assertTrue(verified.data.get("profile").get("isVerified").asBoolean())
        assertEquals("$name@example.com", verified.data.get("profile").get("user").get("email").asString())
        assertEquals(0, verified.data.get("profile").get("_count").get("rfqs").asInt())

        val order = buyer.post("/api/b2b/bulk-orders", mapOf("productId" to product.id.toString(), "quantity" to 60, "paymentTerms" to "Net 30")).expect(201).data.get("bulkOrder")
        assertEquals(80_000, order.get("unitPricePaise").asLong())
        assertEquals(4_800_000, order.get("totalPricePaise").asLong())

        // Changing the company identity sends the profile back for verification.
        val changed = buyer.post("/api/b2b/profile", mapOf("companyName" to "Trader Company")).expect(200)
        assertEquals("Profile updated. Your company details changed, so it will be verified again.", changed.message)
        assertFalse(changed.data.get("profile").get("isVerified").asBoolean())
    }

    @Test
    fun `staff keep a trade-credit ledger within the limit`() {
        val name = unique("credit")
        val buyer = customer(name)
        val id = customerId("$name@example.com")
        buyer.post("/api/b2b/profile", mapOf("companyName" to "Credit Co")).expect(201)
        val admin = admin()
        admin.post("/api/admin/b2b/profiles/$id/credit", mapOf("type" to "CREDIT_ISSUED", "amountPaise" to 1000)).expect(409) // no limit yet
        admin.patch("/api/admin/b2b/profiles/$id", mapOf("creditLimitPaise" to 500_000)).expect(200)
        admin.post("/api/admin/b2b/profiles/$id/credit", mapOf("type" to "CREDIT_ISSUED", "amountPaise" to 300_000, "reference" to "INV-1")).expect(201)
        val after = admin.post("/api/admin/b2b/profiles/$id/credit", mapOf("type" to "PAYMENT_RECEIVED", "amountPaise" to 100_000)).expect(201).data.get("credit")
        assertEquals(200_000, after.get("creditUsedPaise").asLong())
        assertEquals(300_000, after.get("availablePaise").asLong())
        admin.post("/api/admin/b2b/profiles/$id/credit", mapOf("type" to "PAYMENT_RECEIVED", "amountPaise" to 900_000)).expect(409)
        admin.patch("/api/admin/b2b/profiles/$id", mapOf("creditLimitPaise" to 100_000)).expect(409)

        val mine = buyer.get("/api/b2b/credit").expect(200).data.get("credit")
        assertEquals(2, mine.get("transactions").size())
        assertEquals(-100_000, mine.get("transactions").get(0).get("amountPaise").asLong())
        assertEquals(200_000, mine.get("transactions").get(0).get("balancePaise").asLong())
    }
}
