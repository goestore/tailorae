package com.tailorae.catalog.rules

import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.KotlinModule
import java.io.ByteArrayOutputStream
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Port of legacy-api/src/utils/sheet-import-myntra.test.ts: a Myntra template
 * read through the catalogue, every column by its exact header.
 */
class SheetImportMyntraTest {
    // The real Dresses header (row 3 of the template), cut to the columns these
    // tests exercise, after Myntra's banner and section rows.
    private val header = listOf(
        "styleGroupId", "vendorSkuCode", "vendorArticleNumber", "vendorArticleName", "brand",
        "Manufacturer Name and Address with Pincode", "Packer Name and Address with Pincode",
        "Importer Name and Address with Pincode", "Country Of Origin", "Country Of Origin2", "articleType",
        "Brand Size", "Standard Size", "is Standard Size present on Label", "Brand Colour (Remarks)", "GTIN",
        "HSN", "MRP", "ISP", "AgeGroup", "Prominent Colour", "Second Prominent Colour", "Third Prominent Colour",
        "Year", "season", "Product Details", "materialCareDescription", "tags", "Fabric", "Neck", "Closure",
        "Net Quantity", "Bust ( Inches )", "Front Length ( Inches )", "Front Image", "Back Image",
        "Additional Image 2",
    )

    private fun values(size: String, bust: String, extra: Map<String, String> = emptyMap()): Map<String, String> = mapOf(
        "styleGroupId" to "7", "vendorSkuCode" to "CK-1-$size", "vendorArticleNumber" to "CK-1",
        "vendorArticleName" to "Girls Floral Dress", "brand" to "Creative Kids",
        "Manufacturer Name and Address with Pincode" to "Maker, Gurugram 122001",
        "Packer Name and Address with Pincode" to "Packer, Gurugram 122001",
        "Importer Name and Address with Pincode" to "",
        "Country Of Origin" to "india", "Country Of Origin2" to "", "articleType" to "Dresses",
        "Brand Size" to size, "Standard Size" to size, "is Standard Size present on Label" to "Yes",
        "Brand Colour (Remarks)" to "Pink", "GTIN" to "", "HSN" to "62044390", "MRP" to "999", "ISP" to "499",
        "AgeGroup" to "Kids-Girls", "Prominent Colour" to "Pink", "Second Prominent Colour" to "Blue",
        "Third Prominent Colour" to "White", "Year" to "2026", "season" to "Summer",
        "Product Details" to "A floral dress.", "materialCareDescription" to "Machine Wash",
        "tags" to "floral, summer", "Fabric" to "polyester", "Neck" to "Round Neck", "Closure" to "NA",
        "Net Quantity" to "1", "Bust ( Inches )" to bust, "Front Length ( Inches )" to "20",
        "Front Image" to "https://img.example/front.jpg", "Back Image" to "https://img.example/back.jpg",
        "Additional Image 2" to "https://img.example/extra2.jpg",
    ) + extra

    private fun quote(value: String) = "\"" + value.replace("\"", "\"\"") + "\""

    private fun line(size: String, bust: String, extra: Map<String, String> = emptyMap()): String {
        val v = values(size, bust, extra)
        return header.joinToString(",") { quote(v[it] ?: "") }
    }

    private fun csv(vararg rows: String): ByteArray =
        (listOf(quote("Version : 13"), quote("Business"), header.joinToString(",") { quote(it) }) + rows).joinToString("\n").toByteArray()

    private fun read(vararg rows: String): Pair<ParsedSheet, List<NormalisedProduct>> {
        val parsed = SheetImport.parseSheet(csv(*rows), "dresses.csv")
        return parsed to SheetImport.normaliseRows(parsed.rows)
    }

    @Test
    fun `recognises the article type and keeps every catalogue column`() {
        val (parsed, products) = read(line("S", "30"), line("M", "32"))
        assertEquals("Dresses", parsed.articleType)
        assertEquals(emptyList(), parsed.unmapped)
        assertEquals(1, products.size)
        val dress = products[0]
        assertEquals("Dresses", dress.articleType)
        val expected = mapOf(
            "styleGroupId" to "7",
            "hsn" to "62044390",
            "countriesOfOrigin" to listOf("India"),
            "manufacturerDetails" to "Maker, Gurugram 122001",
            "packerDetails" to "Packer, Gurugram 122001",
            "ageGroup" to "Kids-Girls",
            "primaryColour" to "Pink",
            "secondaryColour" to "Blue",
            "tertiaryColour" to "White",
            "year" to 2026,
            "materialCare" to "Machine Wash",
            "tags" to listOf("floral", "summer"),
            "netQuantity" to 1,
        )
        for ((key, value) in expected) assertEquals(value, dress.listing[key], key)
        assertNull(dress.listing["importerDetails"])
    }

    @Test
    fun `stores attributes by catalogue key, normalised, and keeps them out of the description`() {
        val (_, products) = read(line("S", "30"))
        // "NA" is one of Myntra's own Closure options, so it is kept as written.
        assertEquals(mapOf("fabric" to "Polyester", "neck" to "Round Neck", "closure" to "NA"), products[0].attributes)
        assertEquals("A floral dress.", products[0].description)
    }

    @Test
    fun `keeps image angles, gallery in angle order, including additional image 2`() {
        val (_, products) = read(line("S", "30"))
        assertEquals(
            mapOf("front" to "https://img.example/front.jpg", "back" to "https://img.example/back.jpg", "additional2" to "https://img.example/extra2.jpg"),
            products[0].imageAngles,
        )
        assertEquals(listOf("https://img.example/front.jpg", "https://img.example/back.jpg", "https://img.example/extra2.jpg"), products[0].images)
    }

    @Test
    fun `keeps per-size standard size, label flag, GTIN and measurements`() {
        val (_, products) = read(line("S", "30", mapOf("GTIN" to "8901234567890")), line("M", "32.5"))
        val (s, m) = products[0].variants
        assertEquals("CK-1-S", s.sku)
        assertEquals("S", s.size)
        assertEquals("S", s.standardSize)
        assertEquals(true, s.sizeOnLabel)
        assertEquals("8901234567890", s.gtin)
        assertEquals(mapOf("bustIn" to 30.0, "frontLengthIn" to 20.0), s.measurementValues)
        assertEquals(mapOf("bustIn" to 32.5, "frontLengthIn" to 20.0), m.measurementValues)
        assertTrue(SheetImport.sizeChartFrom(products[0].variants).contains("Bust (in)"))
    }

    @Test
    fun `reads No on the size-label column as false`() {
        val (_, products) = read(line("S", "30", mapOf("is Standard Size present on Label" to "No")))
        assertEquals(false, products[0].variants[0].sizeOnLabel)
    }

    @Test
    fun `reports a value that is not a Myntra option instead of failing the product`() {
        val (_, products) = read(line("S", "30", mapOf("Fabric" to "Moonbeam", "GTIN" to "12")))
        assertEquals(1, products.size)
        assertNull(products[0].attributes["fabric"])
        val messages = products[0].issues.filter { it.code == "invalid_value" }.map { it.message }
        assertTrue(messages.any { it.contains("Moonbeam") }, messages.toString())
        assertTrue(messages.any { it.contains("GTIN") }, messages.toString())
        assertTrue(products[0].issues.all { it.level == "warning" })
    }

    @Test
    fun `lists what is still missing before the product may go live`() {
        val (_, products) = read(line("S", "30"))
        val missing = SheetImport.missingForLiveOf(products[0]).map { it.key }
        // GTIN is optional to go live: small brands often have no barcodes.
        assertFalse("gtin" in missing)
        assertTrue("knitOrWoven" in missing, missing.toString())
        assertFalse("hsn" in missing)
        assertFalse("front" in missing)
    }

    @Test
    fun `is idempotent, so the commit can re-check what the browser sends back`() {
        val (_, products) = read(line("S", "30"))
        val again = SheetImport.sanitiseListing("Dresses", products[0].listing, products[0].attributes)
        assertEquals(products[0].listing, again.product)
        assertEquals(products[0].attributes, again.attributes)
        assertEquals(emptyList(), again.issues)
    }

    @Test
    fun `drops payload fields that are not listing columns`() {
        val out = SheetImport.sanitiseListing("Dresses", mapOf("status" to "ACTIVE", "vendorId" to "x", "hsn" to "6204"))
        assertEquals(mapOf<String, Any?>("hsn" to "6204"), out.product)
    }

    @Test
    fun `survives a JSON round trip, as the review payload does`() {
        val (_, products) = read(line("S", "30"), line("M", "32"))
        val mapper = JsonMapper.builder().addModule(KotlinModule.Builder().build()).build()
        val back = mapper.readValue(mapper.writeValueAsString(products[0]), NormalisedProduct::class.java)
        assertEquals(products[0].variants, back.variants)
        assertEquals(products[0].attributes, back.attributes)
        val again = SheetImport.sanitiseListing(back.articleType, back.listing, back.attributes)
        assertEquals(emptyList(), again.issues)
        assertEquals(products[0].listing, again.product)
    }

    @Test
    fun `is read the generic way when the sheet is not a known template, keeping HSN and country`() {
        val parsed = SheetImport.parseSheet("sku,name,mrp,hsn,Country Of Origin\nA-S,Dress,999,6204,India".toByteArray(), "x.csv")
        assertNull(parsed.articleType)
        val product = SheetImport.normaliseRows(parsed.rows).single()
        assertNull(product.articleType)
        assertEquals("6204", product.listing["hsn"])
        assertEquals(listOf("India"), product.listing["countriesOfOrigin"])
        assertEquals(emptyList(), SheetImport.missingForLiveOf(product))
    }

    @Test
    fun `reads an xlsx workbook, skipping instruction tabs and the banner rows`() {
        val bytes = XSSFWorkbook().use { workbook ->
            workbook.createSheet("__INSTRUCTIONS").createRow(0).createCell(0).setCellValue("Fill in every yellow column")
            val sheet = workbook.createSheet("Dresses")
            sheet.createRow(0).createCell(0).setCellValue("Version : 13")
            sheet.createRow(1).createCell(0).setCellValue("Business")
            val head = sheet.createRow(2)
            header.forEachIndexed { i, h -> head.createCell(i).setCellValue(h) }
            listOf("S" to "30", "M" to "32").forEachIndexed { r, (size, bust) ->
                val row = sheet.createRow(3 + r)
                val v = values(size, bust)
                header.forEachIndexed { i, h ->
                    val value = v[h] ?: ""
                    // Numbers the way Excel stores them: HSN and MRP as numeric cells.
                    if (h == "HSN" || h == "MRP" || h == "Bust ( Inches )") row.createCell(i).setCellValue(value.toDouble())
                    else row.createCell(i).setCellValue(value)
                }
            }
            ByteArrayOutputStream().also { workbook.write(it) }.toByteArray()
        }
        val parsed = SheetImport.parseSheet(bytes, "dresses.xlsx")
        assertEquals("Dresses", parsed.sheet)
        assertEquals("Dresses", parsed.articleType)
        val products = SheetImport.normaliseRows(parsed.rows)
        assertEquals(1, products.size)
        assertEquals("62044390", products[0].listing["hsn"])
        assertEquals(99900L, products[0].mrpPaise)
        assertEquals(listOf("CK-1-S", "CK-1-M"), products[0].variants.map { it.sku })
        assertEquals(30.0, products[0].variants[0].measurementValues?.get("bustIn"))
    }
}
