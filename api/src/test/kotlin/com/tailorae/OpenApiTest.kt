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
    }
}
