package com.tailorae.catalog.rules

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Port of legacy-api/src/utils/catalog-csv.test.ts (prices now come out as paise). */
class CatalogCsvTest {
    @Test
    fun `reads a plain sheet`() {
        assertEquals(listOf(listOf("a", "b"), listOf("1", "2")), CatalogCsv.parseCsv("a,b\n1,2"))
    }

    @Test
    fun `keeps commas inside quoted fields`() {
        assertEquals(listOf(listOf("name", "description"), listOf("Polo", "Soft, breathable")), CatalogCsv.parseCsv("name,description\nPolo,\"Soft, breathable\""))
    }

    @Test
    fun `keeps newlines inside quoted fields`() {
        assertEquals(listOf(listOf("a"), listOf("one\ntwo")), CatalogCsv.parseCsv("a\n\"one\ntwo\""))
    }

    @Test
    fun `reads a doubled quote as one quote`() {
        assertEquals(listOf(listOf("a"), listOf("He said \"hi\"")), CatalogCsv.parseCsv("a\n\"He said \"\"hi\"\"\""))
    }

    @Test
    fun `accepts CRLF, and does not emit a blank row per line ending`() {
        assertEquals(listOf(listOf("a", "b"), listOf("1", "2")), CatalogCsv.parseCsv("a,b\r\n1,2\r\n"))
    }

    @Test
    fun `drops the byte-order mark Excel writes`() {
        assertEquals("sku", CatalogCsv.parseCsv("﻿sku,name\nA1,Polo")[0][0])
    }

    @Test
    fun `reads a last row with no trailing newline`() {
        assertEquals(listOf(listOf("a"), listOf("1")), CatalogCsv.parseCsv("a\n1"))
    }

    @Test
    fun `ignores rows that are entirely empty`() {
        assertEquals(listOf(listOf("a", "b"), listOf("1", "2")), CatalogCsv.parseCsv("a,b\n1,2\n,\n"))
    }

    private val header = "sku,name,price,category,color,size,variantQuantity"

    @Test
    fun `refuses a file with no required columns rather than importing nothing`() {
        val result = CatalogCsv.parseCatalogCsv("name,price\nPolo,499")
        assertEquals(0, result.products.size)
        assertTrue(result.errors[0].message.contains("sku"))
    }

    @Test
    fun `builds one product from a single row`() {
        val (products, errors) = CatalogCsv.parseCatalogCsv("$header\nP1,Polo,499,Men,,,")
        assertEquals(emptyList(), errors)
        assertEquals(1, products.size)
        assertEquals("P1", products[0].sku)
        assertEquals("Polo", products[0].name)
        assertEquals(49900L, products[0].pricePaise)
        assertEquals("Men", products[0].category)
        assertEquals(emptyList(), products[0].variants)
    }

    @Test
    fun `groups repeated rows into one product with its variants`() {
        val csv = listOf(header, "P1,Polo,499,Men,Navy,S,4", "P1,Polo,499,Men,Navy,M,6", "P1,Polo,499,Men,White,S,0").joinToString("\n")
        val (products, errors) = CatalogCsv.parseCatalogCsv(csv)
        assertEquals(emptyList(), errors)
        assertEquals(1, products.size)
        assertEquals(listOf("Navy/S:4", "Navy/M:6", "White/S:0"), products[0].variants.map { "${it.color}/${it.size}:${it.quantity}" })
    }

    @Test
    fun `derives a variant SKU when the sheet does not carry one`() {
        assertEquals("P1-NAVYBLUE-XL", CatalogCsv.parseCatalogCsv("$header\nP1,Polo,499,Men,Navy Blue,XL,2").products[0].variants[0].sku)
    }

    @Test
    fun `keeps a variant SKU the seller supplied`() {
        assertEquals("MY-OWN-1", CatalogCsv.parseCatalogCsv("sku,name,price,color,size,variantSku\nP1,Polo,499,Navy,S,MY-OWN-1").products[0].variants[0].sku)
    }

    @Test
    fun `reads prices written the way a spreadsheet exports them`() {
        assertEquals(129950L, CatalogCsv.parseCatalogCsv("sku,name,price\nP1,Polo,\"₹1,299.50\"").products[0].pricePaise)
    }

    @Test
    fun `rejects a product with no price rather than importing it as free`() {
        val (products, errors) = CatalogCsv.parseCatalogCsv("$header\nP1,Polo,0,Men,,,")
        assertEquals(0, products.size)
        assertTrue(errors[0].message.contains("price"))
    }

    @Test
    fun `rejects an unknown status instead of guessing one`() {
        assertTrue(CatalogCsv.parseCatalogCsv("sku,name,price,status\nP1,Polo,499,LIVE").errors[0].message.contains("status"))
    }

    @Test
    fun `flags the same colour and size twice in one product`() {
        val (_, errors) = CatalogCsv.parseCatalogCsv(listOf(header, "P1,Polo,499,Men,Navy,S,4", "P1,Polo,499,Men,Navy,S,9").joinToString("\n"))
        assertEquals(1, errors.size)
        assertTrue(errors[0].message.contains("more than once"))
        assertEquals(3, errors[0].row)
    }

    @Test
    fun `flags a variant SKU shared by two different products`() {
        val csv = listOf("sku,name,price,color,size,variantSku", "P1,Polo,499,Navy,S,SHARED", "P2,Tee,299,Navy,S,SHARED").joinToString("\n")
        assertTrue(CatalogCsv.parseCatalogCsv(csv).errors[0].message.contains("already used by"))
    }

    @Test
    fun `reports the row number a spreadsheet shows, header included`() {
        assertEquals(3, CatalogCsv.parseCatalogCsv(listOf(header, "P1,Polo,499,Men,,,", ",Missing,499,Men,,,").joinToString("\n")).errors[0].row)
    }

    @Test
    fun `carries on after a bad row rather than abandoning the file`() {
        val (products, errors) = CatalogCsv.parseCatalogCsv(listOf(header, ",NoSku,499,Men,,,", "P2,Tee,299,Men,,,").joinToString("\n"))
        assertEquals(1, errors.size)
        assertEquals(listOf("P2"), products.map { it.sku })
    }

    @Test
    fun `names columns it does not understand instead of failing on them`() {
        val result = CatalogCsv.parseCatalogCsv("sku,name,price,supplier_notes\nP1,Polo,499,ignore me")
        assertEquals(listOf("supplier_notes"), result.ignoredColumns)
        assertEquals(1, result.products.size)
    }

    @Test
    fun `matches a header whatever case it is written in`() {
        assertEquals("P1", CatalogCsv.parseCatalogCsv("SKU,Name,Price\nP1,Polo,499").products[0].sku)
    }

    @Test
    fun `treats the same SKU in different cases as one product`() {
        assertEquals(1, CatalogCsv.parseCatalogCsv(listOf(header, "p1,Polo,499,Men,Navy,S,4", "P1,Polo,499,Men,Navy,M,2").joinToString("\n")).products.size)
    }

    @Test
    fun `makes a URL-safe slug`() {
        assertEquals("mens-polo-t-shirt", CatalogCsv.slugify("Men's Polo T-Shirt"))
    }

    @Test
    fun `never returns an empty slug`() {
        assertEquals("product", CatalogCsv.slugify("!!!"))
    }

    @Test
    fun `quotes only the cells that need it`() {
        assertEquals("a,b\nplain,\"has, comma\"", CatalogCsv.toCsv(listOf("a", "b"), listOf(listOf("plain", "has, comma"))))
    }

    @Test
    fun `escapes quotes by doubling them, so the file reads back the same`() {
        assertEquals("\"say \"\"hi\"\"\"", CatalogCsv.csvCell("say \"hi\""))
    }

    @Test
    fun `writes an empty cell for a missing value`() {
        assertEquals("", CatalogCsv.csvCell(null))
    }
}
