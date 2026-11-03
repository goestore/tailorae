package com.tailorae.catalog.rules

import org.apache.poi.ss.usermodel.Cell
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Port of legacy-api/src/utils/myntra-export.test.ts: the export is the
 * importer in reverse. Money is paise in the product map, rupees in the sheet.
 */
class MyntraExportTest {
    private val dresses = Catalogue.find("Dresses")!!
    private fun column(header: String) = dresses.columns.first { it.header == header }

    private val small = mapOf<String, Any?>(
        "sku" to "CK-1-S", "size" to "S", "standardSize" to "S", "sizeOnLabel" to true, "gtin" to "8901234567890", "measurements" to mapOf("bustIn" to 30),
    )
    private val medium = mapOf<String, Any?>("sku" to "CK-1-M", "size" to "M", "pricePaise" to 54900L, "sizeOnLabel" to false, "measurements" to mapOf("bustIn" to 32))

    private val product = mapOf<String, Any?>(
        "sku" to "CK-1",
        "name" to "Girls Floral Dress",
        "pricePaise" to 49900L,
        "mrpPaise" to 99900L,
        "description" to "A floral dress.",
        "articleType" to "Dresses",
        "styleGroupId" to null,
        "hsn" to "62044390",
        "countriesOfOrigin" to listOf("India", "Bangladesh"),
        "tags" to listOf("floral", "summer"),
        "brand" to mapOf("name" to "Creative Kids"),
        "attributes" to mapOf("fabric" to "Polyester"),
        "imageAngles" to mapOf("front" to "/uploads/products/front.webp", "back" to "https://cdn.example/back.jpg"),
        "bisCertificate" to mapOf("number" to "BIS-1"),
        "variants" to listOf(small, medium),
    )
    private val base = "https://api.example.com"

    private fun cell(header: String, variant: Map<String, Any?>? = small, p: Map<String, Any?> = product) =
        MyntraExport.cellFor(column(header), p, variant, base)

    @Test
    fun `writes product, size and price columns`() {
        assertEquals("CK-1", cell("vendorArticleNumber"))
        assertEquals("CK-1-S", cell("vendorSkuCode"))
        assertEquals("CK-1-S", cell("SKUCode"))
        assertEquals("Creative Kids", cell("brand"))
        assertEquals("S", cell("Brand Size"))
        assertEquals(999L, cell("MRP"))
        assertEquals(499L, cell("ISP"))
        // A size with its own price override sells at that price.
        assertEquals(549L, cell("ISP", medium))
        assertEquals("62044390", cell("HSN"))
        assertEquals("8901234567890", cell("GTIN"))
    }

    @Test
    fun `writes paise that are not whole rupees as a decimal`() {
        assertEquals(499.5, cell("ISP", small, product + ("pricePaise" to 49950L)))
        // MRP falls back to the selling price when none is stored.
        assertEquals(499L, cell("MRP", small, product + ("mrpPaise" to null)))
    }

    @Test
    fun `defaults the style group to the article number`() {
        assertEquals("CK-1", cell("styleGroupId"))
    }

    @Test
    fun `spreads countries across the five columns and joins tags`() {
        assertEquals("India", cell("Country Of Origin"))
        assertEquals("Bangladesh", cell("Country Of Origin2"))
        assertNull(cell("Country Of Origin3"))
        assertEquals("floral, summer", cell("tags"))
        assertEquals("BIS-1", cell("BIS Certificate Number"))
    }

    @Test
    fun `writes the label flag as Yes or No`() {
        assertEquals("Yes", cell("is Standard Size present on Label"))
        assertEquals("No", cell("is Standard Size present on Label", medium))
    }

    @Test
    fun `writes attributes, measurements and absolute image URLs`() {
        assertEquals("Polyester", cell("Fabric"))
        assertEquals(32, cell("Bust ( Inches )", medium))
        assertEquals("https://api.example.com/uploads/products/front.webp", cell("Front Image"))
        assertEquals("https://cdn.example/back.jpg", cell("Back Image"))
    }

    @Test
    fun `falls back to the gallery when a product has no image angles`() {
        val legacy = product + mapOf("imageAngles" to null, "thumbnail" to "/uploads/a.webp", "images" to listOf("/uploads/a.webp", "/uploads/b.webp"))
        assertEquals("https://api.example.com/uploads/a.webp", cell("Front Image", small, legacy))
        assertEquals("https://api.example.com/uploads/b.webp", cell("Back Image", small, legacy))
    }

    @Test
    fun `leaves absolute URLs alone`() {
        assertEquals("https://x/y.jpg", MyntraExport.absoluteUrl("https://x/y.jpg", base))
    }

    private fun value(cell: Cell?): Any? = when (cell?.cellType) {
        null, CellType.BLANK -> null
        CellType.NUMERIC -> cell.numericCellValue
        CellType.STRING -> cell.stringCellValue.ifEmpty { null }
        else -> cell.toString()
    }

    @Test
    fun `writes one row per size under the template header, clearing the sample rows`() {
        val (bytes, rows) = MyntraExport.buildWorkbook(dresses, listOf(product), base)
        assertEquals(2, rows)
        // Round-trip through bytes, as the download would.
        XSSFWorkbook(bytes.inputStream()).use { back ->
            val sheet = back.getSheet("Dresses")
            assertNotNull(sheet)
            val header = sheet.getRow(MyntraExport.HEADER_ROW - 1)
            fun col(name: String) = header.first { it.cellType == CellType.STRING && it.stringCellValue == name }.columnIndex
            fun at(row: Int, name: String) = value(sheet.getRow(row - 1)?.getCell(col(name)))
            assertEquals("CK-1-S", at(4, "vendorSkuCode"))
            assertEquals("CK-1-M", at(5, "vendorSkuCode"))
            assertEquals(549.0, at(5, "ISP"))
            // The template's own sample data is gone.
            assertNull(at(6, "vendorSkuCode"))
            assertNotNull(back.getSheet("masterdata"))
        }
    }
}
