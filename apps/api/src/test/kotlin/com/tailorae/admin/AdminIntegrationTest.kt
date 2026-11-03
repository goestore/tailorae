package com.tailorae.admin

import com.tailorae.support.IntegrationTest
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AdminIntegrationTest : IntegrationTest() {

    @Test
    fun `dashboard, queues and reports answer, and only staff can see them`() {
        val staff = admin()
        val dash = staff.get("/api/admin/dashboard").expect(200).data
        assertEquals(7, dash.get("week").size())
        assertTrue(dash.get("queues").has("productsAwaitingModeration"))
        staff.get("/api/admin/reports?from=2026-01-01&to=2026-01-31").expect(200)
        assertTrue(staff.get("/api/admin/reports?format=csv").expect(200).body.startsWith("Date,Orders,GMV"))
        staff.get("/api/admin/reports?from=2026-02-01&to=2026-01-01").expect(400)
        customer().get("/api/admin/dashboard").expect(401)
    }

    @Test
    fun `settings accept only known keys with sane values, and every change is audited`() {
        val staff = admin()
        staff.patch("/api/admin/settings", mapOf("commission.default_rate_bp" to 1200)).expect(200)
        assertEquals(1200, staff.get("/api/admin/settings").data.get("commission.default_rate_bp").asInt())
        staff.patch("/api/admin/settings", mapOf("commission.default_rate_bp" to 20_000)).expect(400)
        staff.patch("/api/admin/settings", mapOf("made.up" to 1)).expect(400)
        staff.patch("/api/admin/settings", mapOf("commission.default_rate_bp" to 1000)).expect(200)
        val audit = staff.get("/api/admin/audit?entity=system_setting").expect(200).data
        assertTrue(audit.get("total").asLong() >= 2)
    }

    @Test
    fun `suspending a customer signs them out and blocks sign-in`() {
        val name = unique("suspend")
        val shopper = customer(name)
        val staff = admin()
        val id = staff.get("/api/admin/customers?q=$name").expect(200).data.get("items").get(0).get("id").asString()
        staff.patch("/api/admin/customers/$id/status", mapOf("status" to "SUSPENDED")).expect(200)
        shopper.post("/api/auth/refresh").expect(401)
        anonymous().post("/api/auth/login", mapOf("email" to "$name@example.com", "password" to PASSWORD)).expect(403)
    }
}
