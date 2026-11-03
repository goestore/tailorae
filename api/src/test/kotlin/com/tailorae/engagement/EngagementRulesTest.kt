package com.tailorae.engagement

import com.tailorae.common.BadRequestException
import tools.jackson.databind.json.JsonMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EngagementRulesTest {
    private val json = JsonMapper.builder().build()

    @Test
    fun `a contact message needs all four fields and a real address`() {
        val c = EngagementRules.contact(json.readTree("""{"name": " Asha ", "email": "ASHA@Example.com", "subject": "Sizes", "message": "Hi"}"""))
        assertEquals(EngagementRules.Contact("Asha", "asha@example.com", "Sizes", "Hi"), c)
        assertEquals(
            "Name, email, subject, and message are required.",
            assertFailsWith<BadRequestException> { EngagementRules.contact(json.readTree("""{"name": "A", "email": "a@b.co", "subject": " "}""")) }.message,
        )
        assertEquals(
            "Enter a valid email address.",
            assertFailsWith<BadRequestException> { EngagementRules.contact(json.readTree("""{"name": "A", "email": "nope", "subject": "s", "message": "m"}""")) }.message,
        )
    }

    @Test
    fun `long fields are cut to their limits, not refused`() {
        val c = EngagementRules.contact(json.readTree("""{"name": "${"n".repeat(300)}", "email": "a@b.co", "subject": "s", "message": "${"m".repeat(6000)}"}"""))
        assertEquals(120, c.name.length)
        assertEquals(5000, c.message.length)
    }

    @Test
    fun `newsletter addresses are validated after normalising`() {
        assertEquals("asha@example.com", EngagementRules.normaliseEmail("  Asha@Example.com "))
        assertTrue(EngagementRules.isValidEmail("asha@example.com"))
        assertFalse(EngagementRules.isValidEmail("asha@example"))
        assertFalse(EngagementRules.isValidEmail("a b@example.com"))
        assertFalse(EngagementRules.isValidEmail("a".repeat(250) + "@x.com"))
    }
}
