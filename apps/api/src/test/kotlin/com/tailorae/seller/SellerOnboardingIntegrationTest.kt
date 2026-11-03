package com.tailorae.seller

import com.tailorae.common.SellerScope
import com.tailorae.support.IntegrationTest
import com.tailorae.support.TestClient
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * A seller business from sign-up to approval, the team roles, and the
 * isolation guarantees of docs/ACCOUNTS.md §3 — including row-level security
 * proven directly against Postgres.
 */
class SellerOnboardingIntegrationTest : IntegrationTest() {

    @Autowired lateinit var scope: SellerScope
    @Autowired lateinit var tx: TransactionTemplate

    private val pdf = "%PDF-1.4\n% test document\n".toByteArray()

    private fun business(name: String) = mapOf(
        "shopName" to name,
        "legalName" to "$name Private Limited",
        "businessType" to "PRIVATE_LIMITED",
        "pan" to "AAPFU0939F",
        "registeredAddress" to mapOf("line1" to "12 Linen Lane", "city" to "Jaipur", "state" to "Rajasthan", "postalCode" to "302001"),
        "contactPhone" to "+91 98290 12345",
    )

    /** A seller account with a business that has everything needed to submit. */
    private fun readySeller(): Pair<TestClient, UUID> {
        val seller = sellerAccount()
        val shop = seller.post("/api/seller/business", business(unique("Loom House"))).expect(201).data
        seller.upload("/api/seller/kyc/documents", mapOf("kind" to "PAN"), "file", "pan.pdf", pdf, "application/pdf").expect(201)
        seller.put("/api/seller/bank", mapOf("accountName" to "Loom House", "accountNumber" to "123456789012", "ifsc" to "HDFC0001234")).expect(200)
        return seller to UUID.fromString(shop.get("id").asString())
    }

    @Test
    fun `a seller applies, staff approve, and the shop appears in the directory`() {
        val seller = sellerAccount()
        val created = seller.post("/api/seller/business", business(unique("Indigo Threads"))).expect(201).data
        assertEquals("DRAFT", created.get("status").asString())
        val sellerId = created.get("id").asString()

        // Not ready yet: the checklist says what is missing, and submit refuses.
        val me = seller.get("/api/seller/me").expect(200).data
        assertTrue(me.get("checklist").toString().contains("PAN card"), me.toString())
        seller.post("/api/seller/business/submit").expect(409)

        seller.upload("/api/seller/kyc/documents", mapOf("kind" to "PAN"), "file", "pan.pdf", pdf, "application/pdf").expect(201)
        val bank = seller.put("/api/seller/bank", mapOf("accountName" to "Indigo", "accountNumber" to "998877665544", "ifsc" to "hdfc0001234")).expect(200).data
        assertEquals("••••••5544", bank.get("accountNumberMasked").asString())
        // Stored encrypted, never in clear.
        val stored = jdbc.sql("select account_number_enc from seller_bank_account where seller_id = :s").param("s", UUID.fromString(sellerId)).query(String::class.java).single()
        assertTrue(stored.startsWith("v1:") && !stored.contains("998877665544"))

        assertEquals("SUBMITTED", seller.post("/api/seller/business/submit").expect(200).data.get("status").asString())
        // Legal details freeze once submitted.
        seller.put("/api/seller/business", mapOf("legalName" to "Something Else")).expect(409)

        val admin = admin()
        val review = admin.get("/api/admin/sellers/$sellerId").expect(200).data
        assertEquals(1, review.get("documents").size())
        // The signed document link works, and only until it expires.
        // (Called by path: the link's host is the configured public URL, not this test's random port.)
        val link = java.net.URI(review.get("documents").get(0).get("url").asString()).let { "${it.rawPath}?${it.rawQuery}" }
        anonymous().get(link).expect(200)
        anonymous().get(link.replace(Regex("sig=[^&]+"), "sig=forged")).expect(401)

        admin.post("/api/admin/sellers/$sellerId/decision", mapOf("action" to "REJECT")).expect(400) // a rejection needs a note
        admin.post("/api/admin/sellers/$sellerId/decision", mapOf("action" to "APPROVE")).expect(200)
        assertEquals("APPROVED", seller.get("/api/seller/me").expect(200).data.get("shop").get("status").asString())

        val slug = created.get("shopSlug").asString()
        assertEquals(slug, anonymous().get("/api/sellers/$slug").expect(200).data.get("shopSlug").asString())
    }

    @Test
    fun `one seller cannot reach another seller's documents, and other realms are refused`() {
        val (a, _) = readySeller()
        val (b, _) = readySeller()
        val docOfA = a.get("/api/seller/kyc/documents").expect(200).data.get(0).get("id").asString()

        b.get("/api/seller/kyc/documents/$docOfA/url").expect(404)
        b.delete("/api/seller/kyc/documents/$docOfA").expect(404)
        // Naming A's business in the header is the same as naming a business that does not exist.
        val aId = a.get("/api/seller/me").data.get("shop").get("id").asString()
        b.headers["X-Seller-Id"] = aId
        b.get("/api/seller/me").expect(404)

        customer().get("/api/seller/me").expect(401)
        sellerAccount().get("/api/admin/sellers").expect(401)
    }

    @Test
    fun `row-level security hides other sellers' rows even from an unfiltered query`() {
        val (_, a) = readySeller()
        val (_, b) = readySeller()

        val visible = tx.execute {
            scope.enter(a)
            // No WHERE clause on purpose: the policy alone must filter.
            jdbc.sql("select distinct seller_id from seller_kyc_document").query(UUID::class.java).list()
        }!!
        assertEquals(listOf(a), visible)
        assertTrue(b !in visible)

        val customers = tx.execute { status ->
            status.setRollbackOnly()
            scope.enter(a)
            runCatching { jdbc.sql("select count(*) from customer").query(Long::class.javaObjectType).single() }.isFailure
        }!!
        assertTrue(customers, "the seller scope must not be able to read customers at all")
    }

    @Test
    fun `the owner invites a cataloguer, who joins with limited rights`() {
        val (owner, _) = readySeller()
        val email = "${unique("cataloguer")}@example.com"
        owner.post("/api/seller/members/invites", mapOf("email" to email, "role" to "CATALOG")).expect(201)
        val token = jdbc.sql("select payload::text from outbox_event where topic = 'seller.member.invited' and payload::text like :e")
            .param("e", "%$email%").query(String::class.java).single()
            .let { json.readTree(it).get("payload").get("token").asString() }

        val member = anonymous()
        member.post("/api/seller/auth/register", mapOf("email" to email, "password" to PASSWORD, "fullName" to "Cat", "phone" to "+91 90000 11122")).expect(201)
        assertEquals("CATALOG", member.post("/api/seller/invites/accept", mapOf("token" to token)).expect(200).data.get("role").asString())

        // A cataloguer can see the team but not change the business or its bank account.
        assertEquals(2, member.get("/api/seller/members").expect(200).data.get("members").size())
        member.put("/api/seller/business", mapOf("shopDescription" to "nope")).expect(403)
        member.get("/api/seller/bank").expect(403)
        // The invite works once.
        member.post("/api/seller/invites/accept", mapOf("token" to token)).expect(409)
    }
}
