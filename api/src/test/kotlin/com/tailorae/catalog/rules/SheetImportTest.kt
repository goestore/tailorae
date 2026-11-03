package com.tailorae.catalog.rules

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Port of legacy-api/src/utils/sheet-import.test.ts: finding the header in a
 * sheet that does not start with one, and deciding what to do about a value
 * that is missing.
 */
class SheetImportTest {
    private fun row(values: Map<String, String>, rowNumber: Int = 2) = ImportRow(rowNumber, "Dresses", "test.xlsx", values)

    @Test
    fun `reads Myntra column names`() {
        assertEquals("sku", SheetColumns.fieldForHeader("vendorSkuCode"))
        assertEquals("articleNumber", SheetColumns.fieldForHeader("vendorArticleNumber"))
        assertEquals("category", SheetColumns.fieldForHeader("articleType"))
        assertEquals("colorName", SheetColumns.fieldForHeader("Brand Colour (Remarks)"))
    }

    @Test
    fun `ignores case, punctuation and bracketed units`() {
        assertEquals("measureFrontLength", SheetColumns.fieldForHeader("Front Length ( Inches )"))
        assertEquals("measureFrontLength", SheetColumns.fieldForHeader("front_length"))
        assertEquals("sellingPrice", SheetColumns.fieldForHeader("SELLING PRICE"))
    }

    @Test
    fun `returns null for a column nothing recognises, rather than guessing`() {
        assertNull(SheetColumns.fieldForHeader("supplier internal ref"))
    }

    @Test
    fun `finds a header that is not the first row`() {
        val matrix = listOf(
            listOf("Version : 11", "", ""),
            listOf("Business (Information required)", "", ""),
            listOf("vendorSkuCode", "vendorArticleNumber", "MRP"),
            listOf("A-1", "A", "999"),
        )
        assertEquals(2, SheetColumns.findHeaderRow(matrix))
    }

    @Test
    fun `refuses to pick a row that recognises almost nothing`() {
        assertEquals(-1, SheetColumns.findHeaderRow(listOf(listOf("notes"), listOf("some text"))))
    }

    @Test
    fun `counts distinct fields, so repeated columns do not win`() {
        assertEquals(1, SheetColumns.headerScore(listOf("size", "size", "size")))
        assertEquals(3, SheetColumns.headerScore(listOf("sku", "size", "mrp")))
    }

    @Test
    fun `strips the article number off the front`() {
        assertEquals("0-3M", SheetImport.sizeFromSku("CKGD-0871-WHBL-0-3M", "CKGD-0871-WHBL"))
    }

    @Test
    fun `falls back to a known suffix when the article does not match`() {
        assertEquals("XXL", SheetImport.sizeFromSku("SOMETHING-ELSE-XXL", "OTHER"))
    }

    @Test
    fun `prefers the longest suffix, so XXL is not read as L`() {
        assertEquals("XXL", SheetImport.sizeFromSku("ART-XXL"))
    }

    @Test
    fun `returns nothing rather than inventing a size`() {
        assertEquals("", SheetImport.sizeFromSku("PLAINSKU"))
    }

    private val base = mapOf("sku" to "A-S", "articleNumber" to "A", "name" to "Dress", "mrp" to "999")

    private fun codes(p: NormalisedProduct) = p.issues.map { it.code }

    @Test
    fun `groups sizes of one article and colour into a single product`() {
        val products = SheetImport.normaliseRows(listOf(
            row(base + mapOf("sku" to "A-S", "size" to "S", "colorName" to "Navy"), 4),
            row(base + mapOf("sku" to "A-M", "size" to "M", "colorName" to "Navy"), 5),
        ))
        assertEquals(1, products.size)
        assertEquals(listOf("S", "M"), products[0].variants.map { it.size })
    }

    @Test
    fun `splits colours of one article into separate products`() {
        val products = SheetImport.normaliseRows(listOf(
            row(base + mapOf("sku" to "A-NAVY-S", "size" to "S", "colorName" to "Navy")),
            row(base + mapOf("sku" to "A-WHITE-S", "size" to "S", "colorName" to "White")),
        ))
        assertEquals(2, products.size)
    }

    @Test
    fun `creates a category it has never seen instead of refusing the row`() {
        val products = SheetImport.normaliseRows(listOf(row(base + ("category" to "Pinafores"))))
        assertEquals("Pinafores", products[0].category)
        assertFalse("no_category" in codes(products[0]))
    }

    @Test
    fun `warns when there is no category at all, but still imports`() {
        val products = SheetImport.normaliseRows(listOf(row(base)))
        assertEquals(1, products.size)
        assertTrue("no_category" in codes(products[0]))
    }

    @Test
    fun `files a blank colour as Assorted rather than dropping the row`() {
        val products = SheetImport.normaliseRows(listOf(row(base)))
        assertEquals("Assorted", products[0].colorName)
        assertTrue("color_defaulted" in codes(products[0]))
    }

    @Test
    fun `falls back to the prominent colour when the brand colour is blank`() {
        val products = SheetImport.normaliseRows(listOf(row(base + ("primaryColor" to "Blue"))))
        assertEquals("Blue", products[0].colorName)
        assertTrue("color_from_prominent" in codes(products[0]))
    }

    @Test
    fun `reads the size out of the SKU when there is no size column`() {
        val products = SheetImport.normaliseRows(listOf(row(base + mapOf("sku" to "A-XL", "articleNumber" to "A"))))
        assertEquals("XL", products[0].variants[0].size)
        assertTrue("size_from_sku" in codes(products[0]))
    }

    @Test
    fun `uses MRP as the price when no selling price is given`() {
        assertEquals(99900L, SheetImport.normaliseRows(listOf(row(base)))[0].pricePaise)
    }

    @Test
    fun `prefers an explicit selling price`() {
        assertEquals(79900L, SheetImport.normaliseRows(listOf(row(base + ("sellingPrice" to "799"))))[0].pricePaise)
    }

    @Test
    fun `warns when the selling price is above MRP`() {
        assertTrue("price_above_mrp" in codes(SheetImport.normaliseRows(listOf(row(base + ("sellingPrice" to "1299"))))[0]))
    }

    @Test
    fun `starts stock at zero when the sheet has no stock column, and says so`() {
        val products = SheetImport.normaliseRows(listOf(row(base)))
        assertEquals(0, products[0].variants[0].stock)
        assertTrue("stock_defaulted" in codes(products[0]))
    }

    @Test
    fun `honours an explicit zero without warning about it`() {
        assertFalse("stock_defaulted" in codes(SheetImport.normaliseRows(listOf(row(base + ("stock" to "0"))))[0]))
    }

    @Test
    fun `refuses only what nobody can guess`() {
        val noName = row(mapOf("sku" to "A-S", "mrp" to "999"))
        val noPrice = row(mapOf("sku" to "B-S", "name" to "Dress"))
        assertEquals(0, SheetImport.normaliseRows(listOf(noName, noPrice)).size)
        assertEquals("no_name", noName.issues[0].code)
        assertEquals("no_price", noPrice.issues[0].code)
    }

    @Test
    fun `reports a repeated SKU rather than silently keeping one`() {
        val second = row(base + ("size" to "S"), 5)
        SheetImport.normaliseRows(listOf(row(base + ("size" to "S"), 4), second))
        assertEquals("duplicate_sku", second.issues[0].code)
    }

    @Test
    fun `says a warning once per product, not once per size`() {
        val products = SheetImport.normaliseRows(listOf(
            row(base + mapOf("sku" to "A-S", "size" to "S"), 4),
            row(base + mapOf("sku" to "A-M", "size" to "M"), 5),
            row(base + mapOf("sku" to "A-L", "size" to "L"), 6),
        ))
        assertEquals(1, products[0].issues.count { it.code == "color_defaulted" })
    }

    @Test
    fun `keeps attributes that have a value and drops the NA ones`() {
        val products = SheetImport.normaliseRows(listOf(row(base + mapOf("occasion" to "Casual", "neckType" to "V-Neck", "closure" to "NA"))))
        assertEquals(mapOf("Occasion" to "Casual", "Neck" to "V-Neck"), products[0].attributes)
    }

    @Test
    fun `keeps a size's own price when it differs from the product's`() {
        val products = SheetImport.normaliseRows(listOf(
            row(base + mapOf("sku" to "A-S", "size" to "S", "sellingPrice" to "499"), 4),
            row(base + mapOf("sku" to "A-XL", "size" to "XL", "sellingPrice" to "549"), 5),
        ))
        assertEquals(listOf(null, 54900L), products[0].variants.map { it.pricePaise })
    }

    @Test
    fun `builds a chart from the measurements on each size`() {
        val products = SheetImport.normaliseRows(listOf(
            row(mapOf("sku" to "A-S", "articleNumber" to "A", "name" to "D", "mrp" to "999", "size" to "S", "measureChest" to "18.5", "measureWaist" to "16"), 4),
            row(mapOf("sku" to "A-M", "articleNumber" to "A", "name" to "D", "mrp" to "999", "size" to "M", "measureChest" to "19.5", "measureWaist" to "17"), 5),
        ))
        assertEquals(listOf("Size · Chest (in) · Waist (in)", "S · 18.5 · 16", "M · 19.5 · 17"), SheetImport.sizeChartFrom(products[0].variants).split("\n"))
    }

    @Test
    fun `leaves out a measurement the sheet never carried`() {
        val products = SheetImport.normaliseRows(listOf(row(mapOf("sku" to "A-S", "articleNumber" to "A", "name" to "D", "mrp" to "999", "size" to "S", "measureChest" to "18"))))
        assertEquals("Size · Chest (in)\nS · 18", SheetImport.sizeChartFrom(products[0].variants))
    }

    @Test
    fun `returns nothing when there are no measurements at all`() {
        val products = SheetImport.normaliseRows(listOf(row(mapOf("sku" to "A-S", "articleNumber" to "A", "name" to "D", "mrp" to "999"))))
        assertEquals("", SheetImport.sizeChartFrom(products[0].variants))
    }

    @Test
    fun `tidies a category taken straight from a sheet`() {
        assertEquals("Kids Girls", SheetImport.titleCase("KIDS GIRLS"))
    }
}
