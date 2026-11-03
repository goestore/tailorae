package com.tailorae.catalog.rules

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Port of legacy-api/src/utils/category-fields.test.ts. */
class CategoryFieldsTest {
    private fun field(
        categoryId: String,
        key: String,
        type: FieldType = FieldType.TEXT,
        options: List<String> = emptyList(),
        unit: String? = null,
        label: String = key,
        required: Boolean = false,
        filterable: Boolean = false,
        displayOrder: Int = 0,
    ) = FieldRow("$categoryId-$key", categoryId, key, label, type, options, unit, null, required, filterable, displayOrder)

    private fun cat(id: String, parentId: String?, fields: List<FieldRow> = emptyList(), optionLabel: String? = null, optionValues: List<String> = emptyList()) =
        FieldCategory(id, id.uppercase(), parentId, optionLabel, optionValues, fields)

    // Electronics › Television › LED TV
    private val rows = listOf(
        cat("elec", null, listOf(field("elec", "warranty", FieldType.NUMBER, unit = "months")), optionLabel = "Variant"),
        cat(
            "tv", "elec",
            listOf(
                field("tv", "smartTv", FieldType.BOOLEAN, filterable = true, displayOrder = 1),
                field("tv", "screenSize", FieldType.SELECT, listOf("32 inch", "43 inch", "55 inch"), required = true, filterable = true, displayOrder = 0),
            ),
            optionValues = listOf("A", "B"),
        ),
        cat("led", "tv", listOf(field("led", "ports", FieldType.MULTI_SELECT, listOf("HDMI", "USB"))), optionLabel = "Model"),
        cat("other", null),
    )

    private fun related(rows: List<FieldCategory>, id: String) = CategoryFields.relatedCategoryIds(rows, id, { it.id }, { it.parentId })

    @Test
    fun `walks to the root, root first, and survives a loop`() {
        assertEquals(listOf("elec", "tv", "led"), CategoryFields.ancestorChain(rows, "led").map { it.id })
        assertEquals(listOf("b", "a"), CategoryFields.ancestorChain(listOf(cat("a", "b"), cat("b", "a")), "a").map { it.id })
        assertEquals(emptyList(), CategoryFields.ancestorChain(rows, "missing"))
    }

    @Test
    fun `relates a category to its ancestors and descendants only`() {
        assertEquals(listOf("elec", "led", "tv"), related(rows, "tv").sorted())
        assertEquals(listOf("other"), related(rows, "other"))
    }

    @Test
    fun `lists ancestors first, then display order, marking what is inherited`() {
        val merged = CategoryFields.mergeFields(CategoryFields.ancestorChain(rows, "led"))
        assertEquals(listOf("warranty", "screenSize", "smartTv", "ports"), merged.map { it.field.key })
        val screen = merged.first { it.field.key == "screenSize" }
        assertTrue(screen.inherited)
        assertEquals("tv", screen.definedBy.id)
        assertFalse(merged.first { it.field.key == "ports" }.inherited)
    }

    @Test
    fun `lets the nearest definition of a key win`() {
        val chain = listOf(cat("a", null, listOf(field("a", "size", label = "Old"))), cat("b", "a", listOf(field("b", "size", label = "New"))))
        val merged = CategoryFields.mergeFields(chain)
        assertEquals(1, merged.size)
        assertEquals("New", merged[0].field.label)
        assertEquals("b", merged[0].definedBy.id)
    }

    @Test
    fun `takes the nearest option label and values independently`() {
        val led = CategoryFields.mergeOption(CategoryFields.ancestorChain(rows, "led"))
        assertEquals("Model", led.optionLabel)
        assertEquals(listOf("A", "B"), led.optionValues)
        val tv = CategoryFields.mergeOption(CategoryFields.ancestorChain(rows, "tv"))
        assertEquals("Variant", tv.optionLabel)
        assertEquals("elec", tv.labelFrom?.id)
        val none = CategoryFields.mergeOption(emptyList())
        assertNull(none.optionLabel)
        assertEquals(emptyList(), none.optionValues)
    }

    private val extras = CategoryFields.extrasFor(rows, "led")

    @Test
    fun `maps types to catalogue kinds with inline options`() {
        val byKey = extras.columns.associateBy { it.key }
        val screen = byKey.getValue("screenSize")
        assertEquals("select", screen.kind)
        assertEquals("attribute", screen.scope)
        assertEquals("discoverability", screen.group)
        assertEquals(listOf("32 inch", "43 inch", "55 inch"), screen.values)
        assertEquals("boolean", byKey.getValue("smartTv").kind)
        assertEquals(listOf("Yes", "No"), byKey.getValue("smartTv").values)
        assertEquals("number", byKey.getValue("warranty").kind)
        assertEquals("months", byKey.getValue("warranty").unit)
        assertEquals("multiselect", byKey.getValue("ports").kind)
    }

    @Test
    fun `joins the listing form spec and names the variant option`() {
        val spec = ProductSpec.articleSpec("electronics", extras)!!
        assertEquals("Model", spec.optionLabel)
        assertEquals(listOf("A", "B"), spec.optionValues)
        assertEquals(listOf("32 inch", "43 inch", "55 inch"), spec.columns.first { it.key == "screenSize" }.options)
        // The template's own attributes are still there.
        assertTrue(spec.columns.any { it.key == "modelNumber" })
        // Clothing keeps its size chart name.
        assertEquals("Size", ProductSpec.articleSpec("Dresses", extras)!!.optionLabel)
    }

    @Test
    fun `validates values by type and normalises them`() {
        val data = mutableMapOf<String, Any?>(
            "attributes" to mapOf("screenSize" to "55 INCH", "smartTv" to true, "warranty" to "12", "ports" to "hdmi, usb"),
        )
        assertEquals(emptyList(), ProductSpec.validateListingValues(data, "Electronics", extras.columns))
        assertEquals(mapOf("screenSize" to "55 inch", "smartTv" to "Yes", "warranty" to "12", "ports" to listOf("HDMI", "USB")), data["attributes"])

        val bad = ProductSpec.validateListingValues(
            mutableMapOf("attributes" to mapOf("screenSize" to "50 inch", "smartTv" to "maybe", "warranty" to "a year", "ports" to listOf("VGA"))),
            "Electronics",
            extras.columns,
        )
        assertEquals(4, bad.size, bad.toString())
        // Without the category the same keys are unknown, as before.
        val unknown = ProductSpec.validateListingValues(mutableMapOf("attributes" to mapOf("screenSize" to "55 inch")), "Electronics")
        assertTrue(unknown[0].contains("not an attribute"))
    }

    @Test
    fun `keeps a stored value of a deleted field instead of refusing it`() {
        val errors = ProductSpec.validateListingValues(
            mutableMapOf("attributes" to mapOf("oldField" to "x")), "Electronics", extras.columns, mapOf("oldField" to "x"),
        )
        assertEquals(emptyList(), errors)
    }

    @Test
    fun `works without a template`() {
        assertEquals(emptyList(), ProductSpec.validateListingValues(mutableMapOf("attributes" to mapOf("screenSize" to "43 inch")), null, extras.columns))
    }

    @Test
    fun `requires required category fields to go live`() {
        fun keys(attributes: Map<String, Any?>) = ProductSpec.missingForLive(
            mapOf("articleType" to "General product", "attributes" to attributes, "variants" to listOf(mapOf("size" to "A"))),
            extras.columns,
        ).map { it.key }
        assertTrue("screenSize" in keys(emptyMap()))
        assertFalse("screenSize" in keys(mapOf("screenSize" to "55 inch")))
        assertEquals(
            listOf("screenSize"),
            ProductSpec.missingForLive(mapOf("articleType" to null, "attributes" to emptyMap<String, Any>(), "variants" to emptyList<Any>()), extras.columns).map { it.key },
        )
    }

    @Test
    fun `adds filterable fields and spec-table labels and units`() {
        val filters = ProductSpec.filterableAttributes("electronics", extras.columns).map { it.key }
        assertTrue(filters.containsAll(listOf("screenSize", "smartTv")))
        assertFalse("ports" in filters)
        val info = ProductSpec.templateInfo("electronics", extras)!!
        assertEquals("screenSize", info.attributeLabels["screenSize"])
        assertEquals("months", info.attributeUnits["warranty"])
    }

    @Test
    fun `makes camelCase keys from labels`() {
        assertEquals("screenSize", CategoryFields.camelKey("Screen size"))
        assertEquals("refreshRate", CategoryFields.camelKey("Refresh rate (Hz)"))
        assertEquals("field4kSupport", CategoryFields.camelKey("4K support"))
        assertEquals("energyRatingStars", CategoryFields.camelKey("Energy-rating stars"))
    }

    @Test
    fun `cleans option lists`() {
        assertEquals(listOf("HD", "Full HD", "4K"), CategoryFields.cleanOptions(" HD, Full HD ,hd,, 4K"))
        assertEquals(listOf("1", "a"), CategoryFields.cleanOptions(listOf(1, "a")))
        assertNull(CategoryFields.cleanOptions(emptyMap<String, Any>()))
    }

    @Test
    fun `checks a new field`() {
        val picked = CategoryFields.pickFieldInput(mapOf("label" to "Screen size", "type" to "SELECT", "options" to "32 inch, 43 inch"), null)
        assertEquals(mapOf<String, Any?>("label" to "Screen size", "key" to "screenSize", "type" to "SELECT", "options" to listOf("32 inch", "43 inch")), picked.data)
        assertEquals(emptyList(), picked.errors)
        assertTrue("A list field needs at least one option" in CategoryFields.pickFieldInput(mapOf("label" to "Resolution", "type" to "SELECT"), null).errors)
        assertTrue(CategoryFields.pickFieldInput(mapOf("label" to "x".repeat(61)), null).errors[0].contains("60 characters"))
        val number = CategoryFields.pickFieldInput(mapOf("label" to "Hz", "type" to "NUMBER", "options" to listOf("1"), "unit" to "Hz"), null).data
        assertEquals(emptyList<String>(), number["options"])
        assertEquals("Hz", number["unit"])
        assertTrue(CategoryFields.pickFieldInput(mapOf("label" to "Hz", "type" to "DATE"), null).errors[0].startsWith("type must be"))
    }

    @Test
    fun `refuses a key change on update and rechecks the merged type`() {
        val current = mapOf<String, Any?>("key" to "screenSize", "label" to "Screen size", "type" to "TEXT", "options" to emptyList<String>())
        assertTrue(CategoryFields.pickFieldInput(mapOf("key" to "other"), current).errors[0].contains("cannot be changed"))
        assertTrue("A list field needs at least one option" in CategoryFields.pickFieldInput(mapOf("type" to "SELECT"), current).errors)
        val required = CategoryFields.pickFieldInput(mapOf("required" to true), current)
        assertEquals(mapOf<String, Any?>("required" to true), required.data)
        assertEquals(emptyList(), required.errors)
    }
}
