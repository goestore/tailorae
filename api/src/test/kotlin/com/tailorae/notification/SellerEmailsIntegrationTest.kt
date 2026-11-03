package com.tailorae.notification

import com.tailorae.support.IntegrationTest
import com.tailorae.support.TestClient
import org.junit.jupiter.api.Test
import kotlin.test.assertTrue

/** Seller onboarding events → mail: staff on submit, the owner on a decision, an invitee on invite. */
class SellerEmailsIntegrationTest : IntegrationTest() {

    private val pdf = "%PDF-1.4\n% test document\n".toByteArray()

    private fun readyShop(owner: TestClient, shopName: String): String {
        val shop = owner.post(
            "/api/seller/business",
            mapOf(
                "shopName" to shopName, "legalName" to "$shopName Private Limited", "businessType" to "PRIVATE_LIMITED", "pan" to "AAPFU0939F",
                "registeredAddress" to mapOf("line1" to "12 Linen Lane", "city" to "Jaipur", "state" to "Rajasthan", "postalCode" to "302001"),
                "contactPhone" to "+91 98290 12345",
            ),
        ).expect(201).data
        owner.upload("/api/seller/kyc/documents", mapOf("kind" to "PAN"), "file", "pan.pdf", pdf, "application/pdf").expect(201)
        owner.put("/api/seller/bank", mapOf("accountName" to shopName, "accountNumber" to "123456789012", "ifsc" to "HDFC0001234")).expect(200)
        return shop.get("id").asString()
    }

    @Test
    fun `staff hear about an application and the owner hears the decision`() {
        val ownerName = unique("owner")
        val owner = sellerAccount(ownerName)
        val shopName = unique("Indigo Loom")
        val sellerId = readyShop(owner, shopName)
        owner.post("/api/seller/business/submit").expect(200)

        val alert = MailCapture.await(mail, "admin@tailorae.com", shopName).single()
        assertTrue(MailCapture.text(alert).contains("/admin/sellers?id=$sellerId"), MailCapture.text(alert))
        assertTrue(MailCapture.html(alert).contains("#FECC00"))

        admin().post("/api/admin/sellers/$sellerId/decision", mapOf("action" to "REQUEST_INFO", "note" to "Upload a clearer PAN copy")).expect(200)
        val decision = MailCapture.await(mail, "$ownerName@example.com", "We need a little more from $shopName").single()
        assertTrue(MailCapture.text(decision).contains("> Upload a clearer PAN copy"), MailCapture.text(decision))
        assertTrue(MailCapture.text(decision).contains("/seller/verification"))
    }

    @Test
    fun `an approval is mailed to the owner`() {
        val ownerName = unique("owner")
        val owner = sellerAccount(ownerName)
        val shopName = unique("Saffron Threads")
        val sellerId = readyShop(owner, shopName)
        owner.post("/api/seller/business/submit").expect(200)
        admin().post("/api/admin/sellers/$sellerId/decision", mapOf("action" to "APPROVE")).expect(200)
        MailCapture.await(mail, "$ownerName@example.com", "$shopName is approved on TAILORAE")
    }

    @Test
    fun `an invited teammate gets the invite link`() {
        val owner = sellerAccount()
        val shopName = unique("Khadi House")
        owner.post(
            "/api/seller/business",
            mapOf("shopName" to shopName, "legalName" to "$shopName LLP", "businessType" to "LLP"),
        ).expect(201)
        val invitee = "${unique("teammate")}@example.com"
        owner.post("/api/seller/members/invites", mapOf("email" to invitee, "role" to "CATALOG")).expect(201)

        val invite = MailCapture.await(mail, invitee, shopName).single()
        val text = MailCapture.text(invite)
        assertTrue(Regex("/seller/invite\\?token=[A-Za-z0-9_%-]+").containsMatchIn(text), text)
        assertTrue(text.contains("as a catalogue editor"))
    }
}
