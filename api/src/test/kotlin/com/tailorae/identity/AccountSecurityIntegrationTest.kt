package com.tailorae.identity

import com.tailorae.support.IntegrationTest
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Password reset and change, email and phone confirmation, devices, and staff management. */
class AccountSecurityIntegrationTest : IntegrationTest() {

    /** The newest secret the notification module would have sent for [field]. */
    private fun lastSecret(topic: String, match: String, field: String): String =
        jdbc.sql("select payload::text from outbox_event where topic = :t and payload::text like :m order by created_at desc limit 1")
            .param("t", topic).param("m", "%$match%").query(String::class.java).single()
            .let { json.readTree(it).get("payload").get(field).asString() }

    @Test
    fun `a forgotten password is reset by emailed link, once, and signs out every device`() {
        val name = unique("forgetful")
        val shopper = customer(name)
        val email = "$name@example.com"

        anonymous().post("/api/auth/forgot-password", mapOf("email" to email)).expect(200)
        // An unknown address gets the same answer, so accounts cannot be discovered.
        anonymous().post("/api/auth/forgot-password", mapOf("email" to "nobody-${unique("x")}@example.com")).expect(200)
        val token = lastSecret(IdentityTopics.PASSWORD_RESET_REQUESTED, email, "token")

        anonymous().post("/api/auth/reset-password", mapOf("token" to token, "password" to "short")).expect(400)
        anonymous().post("/api/auth/reset-password", mapOf("token" to token, "password" to "a brand new long password")).expect(200)
        anonymous().post("/api/auth/reset-password", mapOf("token" to token, "password" to "another long password here")).expect(400)
        // The seller realm never accepts a customer's link.
        anonymous().post("/api/seller/auth/reset-password", mapOf("token" to token, "password" to "a brand new long password")).expect(400)

        shopper.post("/api/auth/refresh").expect(401) // the old session was revoked
        anonymous().post("/api/auth/login", mapOf("email" to email, "password" to "a brand new long password")).expect(200)
    }

    @Test
    fun `email confirmation by link, and password change keeps only this device`() {
        val name = unique("confirm")
        val laptop = customer(name)
        val phone = anonymous().apply { post("/api/auth/login", mapOf("email" to "$name@example.com", "password" to PASSWORD)).expect(200) }

        laptop.post("/api/auth/verify-email/resend").expect(200)
        val token = lastSecret(IdentityTopics.EMAIL_VERIFICATION_REQUESTED, "$name@example.com", "token")
        val redirect = anonymous().get("/api/auth/verify-email?token=$token")
        assertEquals(302, redirect.status)
        assertTrue(redirect.header("location")!!.endsWith("/auth/login?verified=verified"))
        assertTrue(laptop.get("/api/auth/verification").expect(200).data.get("email").asBoolean())

        assertEquals(2, laptop.get("/api/auth/sessions").expect(200).data.size())
        laptop.post("/api/auth/change-password", mapOf("currentPassword" to "wrong one", "newPassword" to "x".repeat(12))).expect(400)
        laptop.post("/api/auth/change-password", mapOf("currentPassword" to PASSWORD, "newPassword" to "a fresh long password")).expect(200)
        phone.post("/api/auth/refresh").expect(401)
        laptop.post("/api/auth/refresh").expect(200)
    }

    @Test
    fun `a seller confirms their phone with a code, and cannot submit a shop without it`() {
        val seller = sellerAccount(verified = false)
        val account = seller.get("/api/seller/auth/me").expect(200).data.get("id").asString()
        seller.post("/api/seller/business", mapOf("shopName" to unique("Phone Shop"), "legalName" to "P", "businessType" to "INDIVIDUAL")).expect(201)
        assertTrue(seller.get("/api/seller/me").data.get("checklist").toString().contains("Confirm your phone number"))

        seller.post("/api/seller/auth/phone/send-code").expect(200)
        val code = lastSecret(IdentityTopics.PHONE_OTP_REQUESTED, account, "code")
        val wrong = if (code == "000000") "111111" else "000000"
        seller.post("/api/seller/auth/phone/verify", mapOf("code" to wrong)).expect(400)
        seller.post("/api/seller/auth/phone/verify", mapOf("code" to code)).expect(200)
        assertFalse(seller.get("/api/seller/me").data.get("checklist").toString().contains("Confirm your phone number"))
    }

    @Test
    fun `only a super admin manages staff, and a moderator gets only what it was given`() {
        val root = admin()
        val email = "${unique("mod")}@tailorae.test"
        val created = root.post("/api/admin/staff", mapOf("email" to email, "fullName" to "Mod", "password" to "moderator password 1", "permissions" to listOf("MODERATOR"))).expect(201).data
        val moderator = anonymous().apply { post("/api/admin/auth/login", mapOf("email" to email, "password" to "moderator password 1")).expect(200) }

        moderator.get("/api/admin/staff").expect(403)
        moderator.get("/api/admin/reviews").expect(200)
        moderator.get("/api/admin/payouts").expect(403)

        root.patch("/api/admin/staff/${created.get("id").asString()}/status", mapOf("status" to "SUSPENDED")).expect(200)
        moderator.get("/api/admin/reviews").expect(403) // permissions are read live
    }
}
