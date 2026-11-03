package com.tailorae.customwear

import tools.jackson.databind.json.JsonMapper
import kotlin.test.Test
import kotlin.test.assertEquals

class ProductCustomizationsTest {
    private val json = JsonMapper.builder().build()
    private fun parse(body: String) = ProductCustomizations.parseRows(json.readTree(body))

    @Test
    fun `rows default to free text options and keep only real choices`() {
        val (rows, errors) = parse("""[{"name": " Name on back ", "maxCharacters": 12, "isRequired": true}, {"name": "Thread", "type": "COLOR", "options": ["Gold", "", "Navy"], "additionalPaise": 4900}]""")
        assertEquals(emptyList(), errors)
        assertEquals(CustomizationOption("Name on back", "TEXT", true, null, 0, 12), rows[0])
        assertEquals(CustomizationOption("Thread", "COLOR", false, listOf("Gold", "Navy"), 4900, null), rows[1])
    }

    @Test
    fun `an empty choice list is stored as no choices`() {
        assertEquals(null, parse("""[{"name": "Logo", "type": "image", "options": []}]""").first[0].options)
    }

    @Test
    fun `invalid rows are reported per option`() {
        val (_, errors) = parse("""[{"type": "laser"}, {"name": "x", "additionalPaise": -1, "maxCharacters": 0}]""")
        assertEquals(
            listOf(
                "Option 1: a name is required", "Option 1: type must be text, color, image or embroidery",
                "Option 2: extra cost must be zero or more", "Option 2: character limit must be a whole number above zero",
            ),
            errors,
        )
        assertEquals(listOf("customizations must be an array"), parse("""{"name": "x"}""").second)
    }

    @Test
    fun `defaults are the two free text options`() {
        assertEquals(listOf("Text to print", "Embroidery text"), ProductCustomizations.DEFAULT_OPTIONS.map { it.name })
        assertEquals(listOf(0L, 0L), ProductCustomizations.DEFAULT_OPTIONS.map { it.additionalPaise })
    }
}
