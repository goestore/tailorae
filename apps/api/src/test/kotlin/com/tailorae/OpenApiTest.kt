package com.tailorae

import com.tailorae.support.IntegrationTest
import org.junit.jupiter.api.Test
import kotlin.test.assertTrue

/** The OpenAPI description the web app's types are generated from stays available and complete. */
class OpenApiTest : IntegrationTest() {
    @Test
    fun `the API description lists every realm's routes`() {
        val paths = anonymous().get("/v3/api-docs").expect(200).tree.get("paths")
        listOf("/api/orders", "/api/cart", "/api/seller/me", "/api/admin/dashboard", "/api/payments/razorpay/webhook").forEach {
            assertTrue(paths.has(it), "missing $it")
        }
        // Kotlin `is…` properties keep their JSON names in the description.
        val address = anonymous().get("/v3/api-docs").tree.get("components").get("schemas").get("AddressView").get("properties")
        assertTrue(address.has("isDefault"), address.toString())
    }

    @Test
    fun `an anonymous visitor can ask whether they are signed in without a 401`() {
        val res = anonymous().get("/api/auth/session").expect(200).data
        assertTrue(!res.get("signedIn").asBoolean())
        assertTrue(customer().get("/api/auth/session").expect(200).data.get("signedIn").asBoolean())
        anonymous().get("/api/track-order?orderNumber=TL-1").expect(400)
        anonymous().get("/api/checkout/config").expect(200)
    }
}
