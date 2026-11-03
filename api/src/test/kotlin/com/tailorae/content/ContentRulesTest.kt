package com.tailorae.content

import com.tailorae.common.BadRequestException
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.KotlinModule
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ContentRulesTest {
    private val json = JsonMapper.builder().addModule(KotlinModule.Builder().build()).build()

    private fun pick(body: String) = ContentRules.pickValues(json.readTree(body), json)

    @Test
    fun `namespaces are lowercase slugs`() {
        assertEquals("custom-wear", ContentRules.requireNamespace("custom-wear"))
        assertEquals("brand", ContentRules.requireNamespace("brand"))
        listOf("Brand", "-brand", "brand_x", "", "a".repeat(65), "../x").forEach {
            assertFailsWith<BadRequestException>(it) { ContentRules.requireNamespace(it) }
        }
    }

    @Test
    fun `paths must be JSON pointers of at most eight segments`() {
        assertTrue(ContentRules.PATH.matches("/hero/heading"))
        assertTrue(ContentRules.PATH.matches("/a_b/c-d/E1"))
        assertTrue(!ContentRules.PATH.matches("hero/heading"))
        assertTrue(!ContentRules.PATH.matches("/hero/"))
        assertTrue(!ContentRules.PATH.matches("/hero heading"))
        assertTrue(!ContentRules.PATH.matches("/a/b/c/d/e/f/g/h/i"))
    }

    @Test
    fun `values must be a non-empty array`() {
        assertEquals(listOf("values must be an array of { path, value }"), pick("""{"values": {}}""").second)
        assertEquals(listOf("values must be an array of { path, value }"), pick("""{}""").second)
        assertEquals(listOf("values must contain at least one entry"), pick("""{"values": []}""").second)
    }

    @Test
    fun `a missing value is refused but an explicit null is stored`() {
        val (entries, errors) = pick("""{"values": [{"path": "/a"}, {"path": "/b", "value": null}]}""")
        assertEquals(listOf("values[0].value is required (use null to store an empty value)"), errors)
        assertEquals(1, entries.size)
        assertTrue(entries[0].value.isNull)
    }

    @Test
    fun `bad entries are reported by index`() {
        val (_, errors) = pick("""{"values": [1, {"path": "nope", "value": 1}, {"path": "/ok", "value": "x"}]}""")
        assertEquals(listOf("values[0] must be an object", "values[1].path must be a JSON pointer, e.g. /hero/heading"), errors)
    }

    @Test
    fun `only an explicit true marks a value private`() {
        val (entries, _) = pick(
            """{"values": [{"path": "/a", "value": 1, "isPrivate": true}, {"path": "/b", "value": 1, "isPrivate": "true"}, {"path": "/c", "value": 1}]}""",
        )
        assertEquals(listOf(true, false, false), entries.map { it.isPrivate })
    }

    @Test
    fun `oversized values and oversized batches are refused`() {
        val big = "x".repeat(ContentRules.MAX_VALUE_BYTES)
        assertEquals(listOf("values[0].value exceeds 20000 bytes"), pick("""{"values": [{"path": "/a", "value": "$big"}]}""").second)
        val many = (1..201).joinToString(",") { """{"path": "/p$it", "value": $it}""" }
        val (entries, errors) = pick("""{"values": [$many]}""")
        assertEquals(listOf("values must contain at most 200 entries"), errors)
        assertEquals(200, entries.size)
    }

    @Test
    fun `the highest version of each path wins`() {
        data class Row(val path: String, val version: Int, val value: String)
        val rows = listOf(Row("/b", 1, "b1"), Row("/a", 1, "a1"), Row("/a", 3, "a3"), Row("/b", 2, "b2"))
        val latest = ContentRules.latestPerPath(rows, { it.path }, { it.version })
        assertEquals(listOf("a3", "b2"), latest.map { it.value })
    }
}
