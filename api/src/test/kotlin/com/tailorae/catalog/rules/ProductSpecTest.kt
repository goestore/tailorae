package com.tailorae.catalog.rules

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Port of legacy-api/src/utils/product-spec.test.ts. The catalogue is generated
 * from Myntra's own templates, so these pin the facts read from them.
 */
class ProductSpecTest {
    private val dress = ProductSpec.articleSpec("Dresses")!!
    private fun col(header: String) = dress.columns.first { it.header == header }

    @Test
    fun `covers the eight apparel article types from the templates`() {
        assertEquals(
            listOf("Clothing Set", "Co-Ords", "Dresses", "Rompers", "Shirts", "Skirts", "Tops", "Trousers"),
            ProductSpec.listArticleTypes().filter { it.family == "apparel" }.map { it.articleType }.sorted(),
        )
    }

    @Test
    fun `merges the general templates, each naming its variant option`() {
        val general = ProductSpec.listArticleTypes().filter { it.family == "general" }
        assertEquals(
            listOf("bags-accessories", "beauty-personal-care", "electronics", "footwear", "general", "home-kitchen"),
            general.map { it.slug }.sorted(),
        )
        assertEquals("UK size", general.first { it.slug == "footwear" }.optionLabel)
        assertEquals("Size", ProductSpec.listArticleTypes().first { it.slug == "dresses" }.optionLabel)
    }

    @Test
    fun `reads Myntra mandatory flags and dropdowns for Dresses`() {
        assertTrue(col("Fabric").required)
        assertEquals(50, col("Fabric").options!!.size)
        assertTrue("V-Neck" in col("Neck").options!!)
        assertFalse(col("Occasion").required)
        assertEquals("product", col("MRP").scope)
        assertEquals("mrpPaise", col("MRP").field)
        assertTrue(col("MRP").required)
        assertEquals("variant", col("GTIN").scope)
        assertEquals("gtin", col("GTIN").field)
        assertEquals("measurement", col("Bust ( Inches )").scope)
        assertTrue(col("Bust ( Inches )").required)
        assertTrue("XL" in dress.sizes)
    }

    // ── general templates ─────────────────────────────────────────────────

    private val footwear = ProductSpec.articleSpec("Footwear")!!
    private val electronics = ProductSpec.articleSpec("electronics")!!

    @Test
    fun `gives footwear UK sizes 3 to 12 with half sizes, and electronics free options`() {
        assertEquals("UK 3", footwear.sizes.first())
        assertTrue("UK 7.5" in footwear.sizes)
        assertEquals("UK 12", footwear.sizes.last())
        assertFalse(footwear.freeOptions)
        assertEquals(emptyList(), electronics.sizes)
        assertTrue(electronics.freeOptions)
    }

    @Test
    fun `borrows countries from the Myntra catalogue and keeps HSN required`() {
        val country = footwear.columns.first { it.key == "countryOfOrigin" }
        assertTrue("India" in country.options!!)
        val hsn = footwear.columns.first { it.key == "hsn" }
        assertTrue(hsn.required)
        assertEquals("hsn", hsn.field)
        assertFalse(footwear.columns.any { it.scope == "measurement" })
    }

    @Test
    fun `validates general attributes, including numbers`() {
        val data = mutableMapOf<String, Any?>("articleType" to "footwear", "attributes" to mapOf("upperMaterial" to "leather", "soleMaterial" to "EVA"))
        assertEquals(emptyList(), ProductSpec.validateListingValues(data, null))
        assertEquals("Footwear", data["articleType"])
        assertEquals("Leather", (data["attributes"] as Map<*, *>)["upperMaterial"])
        val cheese = ProductSpec.validateListingValues(mutableMapOf("attributes" to mapOf("upperMaterial" to "Cheese")), "Footwear")
        assertTrue(cheese.joinToString(" ").contains("Upper material must be one of the listed options"), cheese.toString())
        val year = ProductSpec.validateListingValues(mutableMapOf("attributes" to mapOf("warrantyMonths" to "a year")), "Electronics")
        assertTrue(year[0].contains("Warranty (months) must be a number"), year.toString())
        val ok = mutableMapOf<String, Any?>("attributes" to mapOf("warrantyMonths" to "12", "modelNumber" to "X-100"))
        assertEquals(emptyList(), ProductSpec.validateListingValues(ok, "Electronics"))
    }

    @Test
    fun `names the missing variant by its option label`() {
        val missing = ProductSpec.missingForLive(mapOf("articleType" to "Electronics", "variants" to emptyList<Any>()))
        assertEquals("At least one variant", missing.first { it.key == "sizes" }.label)
        assertTrue(missing.map { it.key }.containsAll(listOf("modelNumber", "warrantyMonths", "hsn", "front")))
    }

    @Test
    fun `exposes filterable attributes and template info`() {
        val keys = ProductSpec.filterableAttributes("footwear").map { it.key }
        assertTrue(keys.containsAll(listOf("upperMaterial", "soleMaterial", "closure", "occasion")))
        assertFalse("heelHeight" in keys)
        val info = ProductSpec.templateInfo("Footwear")!!
        assertEquals("general", info.family)
        assertEquals("UK size", info.optionLabel)
        assertEquals("Upper material", info.attributeLabels["upperMaterial"])
        assertNull(ProductSpec.templateInfo(null))
    }

    // ── validateListingValues ─────────────────────────────────────────────

    @Test
    fun `normalises a dropdown value to Myntra spelling`() {
        val data = mutableMapOf<String, Any?>("articleType" to "dresses", "attributes" to mapOf("fabric" to "cotton"), "ageGroup" to "kids-girls")
        assertEquals(emptyList(), ProductSpec.validateListingValues(data, null))
        assertEquals("Dresses", data["articleType"])
        assertEquals("Kids-Girls", data["ageGroup"])
        assertEquals("Cotton", (data["attributes"] as Map<*, *>)["fabric"])
    }

    @Test
    fun `refuses values that are not options, and attributes the type does not have`() {
        val errors = ProductSpec.validateListingValues(mutableMapOf("attributes" to mapOf("fabric" to "Moon dust", "waistRise" to "High-Rise")), "Dresses")
            .joinToString(" ")
        assertTrue(errors.contains("Fabric must be one of"), errors)
        assertTrue(errors.contains("waistRise is not an attribute of Dresses"), errors)
    }

    @Test
    fun `checks HSN shape and unknown article types`() {
        assertTrue("HSN must be 4 to 8 digits" in ProductSpec.validateListingValues(mutableMapOf("hsn" to "62A4"), "Dresses"))
        assertTrue(ProductSpec.validateListingValues(mutableMapOf("articleType" to "Spacesuits"), null)[0].startsWith("articleType must be one of"))
    }

    // ── pickVariantListingFields ──────────────────────────────────────────

    @Test
    fun `accepts GTIN and measurements, rejects bad ones`() {
        val ok = ProductSpec.pickVariantListingFields(mapOf("gtin" to "8901234567890", "measurements" to mapOf("bustIn" to "17.5")))
        assertEquals(mapOf<String, Any?>("gtin" to "8901234567890", "measurements" to mapOf("bustIn" to 17.5)), ok.data)
        assertEquals(emptyList(), ok.errors)
        assertTrue(ProductSpec.pickVariantListingFields(mapOf("gtin" to "12345")).errors[0].contains("GTIN"))
        assertTrue(ProductSpec.pickVariantListingFields(mapOf("measurements" to mapOf("bustIn" to 900))).errors[0].contains("0 to 200"))
    }

    @Test
    fun `accepts extra option values and refuses a list`() {
        val ok = ProductSpec.pickVariantListingFields(mapOf("options" to mapOf("Storage" to " 128 GB ", "Colour" to "")))
        assertEquals(mapOf<String, Any?>("options" to mapOf("Storage" to "128 GB")), ok.data)
        assertEquals(emptyList(), ok.errors)
        assertTrue(ProductSpec.pickVariantListingFields(mapOf("options" to listOf("128 GB"))).errors[0].contains("options must be an object"))
    }

    @Test
    fun `checks a colour family against the fixed list`() {
        assertEquals("Navy Blue", ProductSpec.pickVariantListingFields(mapOf("colorFamily" to "navy")).data["colorFamily"])
        assertTrue(ProductSpec.pickVariantListingFields(mapOf("colorFamily" to "sunset")).errors[0].contains("is not a colour family"))
    }

    // ── missingForLive ────────────────────────────────────────────────────

    private val base = mapOf<String, Any?>("articleType" to "Dresses", "variants" to emptyList<Any>())

    @Test
    fun `lists everything for an empty Dress, including sizes and the front image`() {
        val keys = ProductSpec.missingForLive(base).map { it.key }
        assertTrue(keys.containsAll(listOf("sizes", "fabric", "front", "mrp", "hsn")), keys.toString())
    }

    @Test
    fun `is empty for a legacy product with no article type`() {
        assertEquals(emptyList(), ProductSpec.missingForLive(mapOf("articleType" to null, "variants" to emptyList<Any>())))
    }

    @Test
    fun `counts sizes that lack a measurement`() {
        val missing = ProductSpec.missingForLive(
            base + ("variants" to listOf(mapOf("size" to "S", "measurements" to mapOf("bustIn" to 30)), mapOf("size" to "M", "measurements" to emptyMap<String, Any>()))),
        )
        assertTrue(missing.first { it.key == "bustIn" }.label.contains("(1 size)"))
    }

    @Test
    fun `takes bust or chest, and does not need a GTIN`() {
        val keys = ProductSpec.missingForLive(base + ("variants" to listOf(mapOf("size" to "0-3M", "measurements" to mapOf("chestIn" to 17))))).map { it.key }
        assertFalse("bustIn" in keys)
        assertFalse("chestIn" in keys)
        assertFalse("gtin" in keys)
        val label = ProductSpec.missingForLive(base + ("variants" to listOf(mapOf("size" to "S", "measurements" to emptyMap<String, Any>()))))
            .first { it.key == "bustIn" }.label
        assertEquals("Bust or Chest (in) (1 size)", label)
    }

    @Test
    fun `asks for a selling price only when one was given as zero`() {
        assertTrue("price" in ProductSpec.missingForLive(base + ("pricePaise" to 0L)).map { it.key })
        assertFalse("price" in ProductSpec.missingForLive(base + ("pricePaise" to 49900L)).map { it.key })
        assertFalse("price" in ProductSpec.missingForLive(base).map { it.key })
    }

    // ── prepareListingWrite ───────────────────────────────────────────────

    @Test
    fun `orders images by angle and sets the thumbnail to the front image`() {
        val data = mutableMapOf<String, Any?>("articleType" to "Dresses", "imageAngles" to mapOf("back" to "/b.webp", "front" to "/f.webp"))
        assertEquals(emptyList(), ProductSpec.prepareListingWrite(data, null))
        assertEquals(listOf("/f.webp", "/b.webp"), data["images"])
        assertEquals("/f.webp", data["thumbnail"])
    }

    @Test
    fun `lets a draft through but refuses to make an incomplete listing live`() {
        assertEquals(emptyList(), ProductSpec.prepareListingWrite(mutableMapOf("articleType" to "Dresses", "status" to "DRAFT"), null))
        val error = assertThrows<LiveCheckException> {
            ProductSpec.prepareListingWrite(mutableMapOf("articleType" to "Dresses", "status" to "ACTIVE"), null)
        }
        assertTrue(error.missing.isNotEmpty())
        assertTrue(error.message!!.startsWith("This listing is not ready to go live"))
    }

    @Test
    fun `keeps a stored value of a deleted category field across a save`() {
        val data = mutableMapOf<String, Any?>("attributes" to mutableMapOf<String, Any?>("fabric" to "Cotton"))
        val existing = mapOf<String, Any?>("articleType" to "Dresses", "attributes" to mapOf("oldField" to "x", "neck" to "V-Neck"))
        assertEquals(emptyList(), ProductSpec.prepareListingWrite(data, existing))
        // oldField was an admin field since deleted: kept. neck is a template attribute: the form owns it.
        assertEquals(mapOf("fabric" to "Cotton", "oldField" to "x"), data["attributes"])
    }
}
