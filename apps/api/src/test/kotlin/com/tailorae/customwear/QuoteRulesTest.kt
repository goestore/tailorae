package com.tailorae.customwear

import tools.jackson.databind.json.JsonMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class QuoteRulesTest {
    private val json = JsonMapper.builder().build()
    private val artwork = "artwork/01900000-0000-7000-8000-0000000000aa.png"

    private fun contact(body: String): Pair<QuoteContact, List<String>> {
        val errors = mutableListOf<String>()
        return QuoteRules.parseContact(json.readTree(body), errors) to errors
    }

    private fun item(body: String): Pair<QuoteItem, List<String>> {
        val errors = mutableListOf<String>()
        return QuoteRules.parseItem(json.readTree(body), errors) to errors
    }

    @Test
    fun `references look like CWQ-year-six digits`() {
        repeat(50) { assertTrue(QuoteRules.REFERENCE.matches(QuoteRules.newReference())) }
        assertEquals("CWQ-2026-", QuoteRules.newReference(2026).take(9))
        assertTrue(!QuoteRules.REFERENCE.matches("CWQ-26-123456"))
    }

    @Test
    fun `contact needs name, a valid email and country, email is lower-cased`() {
        val (ok, none) = contact("""{"customerName": " Asha ", "email": "Asha@Example.COM", "country": "India", "phone": ""}""")
        assertEquals(emptyList(), none)
        assertEquals("Asha", ok.customerName)
        assertEquals("asha@example.com", ok.email)
        assertNull(ok.phone)

        val (_, errors) = contact("""{"email": "nope", "country": 5, "company": "${"x".repeat(161)}"}""")
        assertEquals(
            listOf("customerName is required", "email is not a valid address", "country must be text", "company must be at most 160 characters"),
            errors,
        )
    }

    @Test
    fun `quantity must be a whole number in range`() {
        listOf("0", "1.5", "\"10\"", "1000001").forEach { q ->
            val (_, errors) = item("""{"productId": "p", "quantity": $q}""")
            assertEquals(listOf("quantity must be a whole number between 1 and 1,000,000"), errors, q)
        }
        assertEquals(25, item("""{"productId": "p", "quantity": 25}""").first.quantity)
        assertEquals(25, item("""{"productId": "p", "quantity": 25.0}""").first.quantity)
    }

    @Test
    fun `placements derive method, locations and a summary for the print team`() {
        val (parsed, errors) = item(
            """
            {"productId": "p", "quantity": 10, "notes": "Navy thread please",
             "placements": [
               {"location": "left-chest", "method": "embroidery", "templateId": "crest-01", "widthPercent": 42.5},
               {"location": "full-back", "method": "screen-printing", "designFileName": "logo.png"},
               {"location": "left-chest", "method": "embroidery"},
               "junk"
             ]}
            """.trimIndent(),
        )
        assertEquals(emptyList(), errors)
        assertEquals(listOf("left-chest", "full-back"), parsed.locations)
        assertEquals("embroidery, screen-printing", parsed.method)
        assertEquals(
            "Navy thread please\n\nPlacements:\n" +
                "- left-chest · embroidery · template crest-01 · 43% width\n" +
                "- full-back · screen-printing · file logo.png\n" +
                "- left-chest · embroidery",
            parsed.notes,
        )
    }

    @Test
    fun `explicit method and locations win over placements`() {
        val (parsed, _) = item("""{"productId": "p", "quantity": 1, "method": "dtg", "locations": ["upper-back"], "placements": [{"location": "left-chest", "method": "embroidery"}]}""")
        assertEquals("dtg", parsed.method)
        assertEquals(listOf("upper-back"), parsed.locations)
    }

    @Test
    fun `lists are de-duplicated and bounded`() {
        assertEquals(listOf("M", "L"), item("""{"productId": "p", "quantity": 1, "sizes": ["M", " L", "M"]}""").first.sizes)
        assertEquals(listOf("sizes contains an invalid entry"), item("""{"productId": "p", "quantity": 1, "sizes": ["M", ""]}""").second)
        assertEquals(
            listOf("locations must be a list of at most 8 entries"),
            item("""{"productId": "p", "quantity": 1, "locations": [${(1..9).joinToString(",") { "\"l$it\"" }}]}""").second,
        )
    }

    @Test
    fun `design files must be artwork this API issued`() {
        assertEquals(listOf(artwork), item("""{"productId": "p", "quantity": 1, "designFiles": ["$artwork"]}""").first.designFiles)
        listOf("/uploads/artwork/abc.png", "https://evil.example/x.png", "artwork/not-a-uuid.png", "artwork/01900000-0000-7000-8000-0000000000aa.svg").forEach {
            assertEquals(
                listOf("designFiles must be artwork uploaded through /api/custom-wear/artwork"),
                item("""{"productId": "p", "quantity": 1, "designFiles": ["$it"]}""").second,
                it,
            )
        }
        assertEquals(java.util.UUID.fromString("01900000-0000-7000-8000-0000000000aa"), ArtworkStore.idOf(artwork))
        assertNull(ArtworkStore.idOf("artwork/x.png"))
    }

    @Test
    fun `productId is required`() {
        assertEquals(listOf("productId is required"), item("""{"quantity": 1}""").second)
    }
}
