package com.tailorae.catalog.rules

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Normalizer

data class ParsedVariant(
    val color: String?,
    val size: String?,
    val sku: String,
    val quantity: Int,
    val pricePaise: Long?,
)

data class ParsedProduct(
    val sku: String,
    val name: String,
    val slug: String? = null,
    val category: String? = null,
    val brand: String? = null,
    val description: String? = null,
    val shortDescription: String? = null,
    val material: String? = null,
    val status: String? = null,
    val pricePaise: Long,
    /** The `originalPrice` column. */
    val mrpPaise: Long? = null,
    /** The `costPrice` column. */
    val costPaise: Long? = null,
    val quantity: Int? = null,
    /** The `weight` column, in grams. */
    val weightGrams: Int? = null,
    val sizeGuide: String? = null,
    val metaTitle: String? = null,
    val metaDescription: String? = null,
    val variants: MutableList<ParsedVariant> = mutableListOf(),
    /** 1-based rows this product was assembled from, for error messages. */
    val rows: MutableList<Int> = mutableListOf(),
)

/** 1-based, counting the header — the number the spreadsheet shows. */
data class RowError(val row: Int, val message: String)

data class CsvParseResult(
    val products: List<ParsedProduct>,
    val errors: List<RowError>,
    /** Columns present in the file that the importer does not use. */
    val ignoredColumns: List<String>,
)

/**
 * Bulk catalogue import from a flat CSV: one row per variant, the product's
 * own columns repeated (port of legacy-api/src/utils/catalog-csv.ts).
 * Prices in the file are rupees; they come out as paise.
 */
object CatalogCsv {
    val PRODUCT_COLUMNS = listOf(
        "sku", "name", "slug", "category", "brand", "description", "shortDescription", "material", "status",
        "price", "originalPrice", "costPrice", "quantity", "weight", "sizeGuide", "metaTitle", "metaDescription",
    )
    val VARIANT_COLUMNS = listOf("color", "size", "variantSku", "variantQuantity", "variantPrice")
    val KNOWN_COLUMNS: List<String> = PRODUCT_COLUMNS + VARIANT_COLUMNS
    val STATUSES = listOf("DRAFT", "ACTIVE", "INACTIVE", "DISCONTINUED")

    /**
     * Split CSV text into rows of cells. A quoted field may contain commas,
     * newlines and doubled quotes; a naive split corrupts every description
     * containing a comma.
     */
    fun parseCsv(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val field = StringBuilder()
        var quoted = false
        // A BOM from Excel would otherwise become part of the first header name.
        val input = text.removePrefix("﻿")
        var i = 0
        while (i < input.length) {
            val char = input[i]
            if (quoted) {
                if (char == '"') {
                    if (i + 1 < input.length && input[i + 1] == '"') {
                        field.append('"'); i++
                    } else {
                        quoted = false
                    }
                } else {
                    field.append(char)
                }
                i++
                continue
            }
            when (char) {
                '"' -> quoted = true
                ',' -> { row += field.toString(); field.clear() }
                '\n', '\r' -> {
                    // Accept LF, CRLF and lone CR without emitting a blank row for each half.
                    if (char == '\r' && i + 1 < input.length && input[i + 1] == '\n') i++
                    row += field.toString()
                    rows += row
                    row = mutableListOf()
                    field.clear()
                }
                else -> field.append(char)
            }
            i++
        }
        // A file not ending in a newline still has a last row.
        if (field.isNotEmpty() || row.isNotEmpty()) {
            row += field.toString()
            rows += row
        }
        // Excel pads short rows with empty cells; a row of nothing is not a record.
        return rows.filter { cells -> cells.any { it.trim().isNotEmpty() } }
    }

    /** null when absent or blank, NaN when not a number. Accepts "1,299.00" and "₹1299". */
    private fun num(value: String?): BigDecimal? {
        val trimmed = value?.trim() ?: return null
        if (trimmed.isEmpty()) return null
        val cleaned = trimmed.replace(Regex("[₹,\\s]"), "")
        return cleaned.toBigDecimalOrNull() ?: NAN
    }

    private val NAN = BigDecimal("-999999999999.123456789")

    private fun BigDecimal.isNaN() = this === NAN

    internal fun toPaise(rupees: BigDecimal): Long = rupees.movePointRight(2).setScale(0, RoundingMode.HALF_UP).toLong()

    private fun text(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * Turn a sheet into products with their variants. Rows are grouped by `sku`;
     * product-level values are taken from the first row of each group.
     */
    fun parseCatalogCsv(csv: String): CsvParseResult {
        val rows = parseCsv(csv)
        if (rows.isEmpty()) return CsvParseResult(emptyList(), listOf(RowError(0, "The file is empty")), emptyList())

        val header = rows[0].map { it.trim() }
        val lower = header.map { it.lowercase() }
        fun indexOf(column: String) = lower.indexOf(column.lowercase())

        val missing = listOf("sku", "name", "price").filter { indexOf(it) == -1 }
        if (missing.isNotEmpty()) {
            return CsvParseResult(emptyList(), listOf(RowError(1, "The header is missing required column(s): ${missing.joinToString(", ")}")), emptyList())
        }

        val known = KNOWN_COLUMNS.map { it.lowercase() }.toSet()
        val ignoredColumns = header.filter { it.isNotEmpty() && it.lowercase() !in known }

        val errors = mutableListOf<RowError>()
        val byKey = LinkedHashMap<String, ParsedProduct>()

        for (r in 1 until rows.size) {
            val cells = rows[r]
            val rowNumber = r + 1
            fun cell(column: String): String? {
                val index = indexOf(column)
                return if (index == -1) null else cells.getOrNull(index)
            }

            val sku = text(cell("sku"))
            val name = text(cell("name"))
            if (sku == null) {
                errors += RowError(rowNumber, "sku is required")
                continue
            }

            val key = sku.uppercase()
            var product = byKey[key]
            if (product == null) {
                val price = num(cell("price"))
                if (name == null) {
                    errors += RowError(rowNumber, "$sku: name is required")
                    continue
                }
                if (price == null || price.isNaN() || price.signum() <= 0) {
                    errors += RowError(rowNumber, "$sku: price must be a number above zero")
                    continue
                }
                val status = text(cell("status"))?.uppercase()
                if (status != null && status !in STATUSES) {
                    errors += RowError(rowNumber, "$sku: status must be one of ${STATUSES.joinToString(", ")}")
                    continue
                }
                fun money(column: String) = num(cell(column))?.takeIf { !it.isNaN() && it.signum() >= 0 }?.let(::toPaise)
                product = ParsedProduct(
                    sku = sku,
                    name = name,
                    slug = text(cell("slug")),
                    category = text(cell("category")),
                    brand = text(cell("brand")),
                    description = text(cell("description")),
                    shortDescription = text(cell("shortDescription")),
                    material = text(cell("material")),
                    status = status,
                    pricePaise = toPaise(price),
                    mrpPaise = money("originalPrice"),
                    costPaise = money("costPrice"),
                    quantity = num(cell("quantity"))?.takeIf { !it.isNaN() && it.signum() >= 0 }?.setScale(0, RoundingMode.DOWN)?.toInt(),
                    weightGrams = num(cell("weight"))?.takeIf { !it.isNaN() && it.signum() >= 0 }?.setScale(0, RoundingMode.HALF_UP)?.toInt(),
                    sizeGuide = text(cell("sizeGuide")),
                    metaTitle = text(cell("metaTitle")),
                    metaDescription = text(cell("metaDescription")),
                )
                byKey[key] = product
            }

            product.rows += rowNumber

            // The variant on this row, if there is one.
            val color = text(cell("color"))
            val size = text(cell("size"))
            if (color == null && size == null) continue

            val variantQuantity = num(cell("variantQuantity"))
            if (variantQuantity != null && (variantQuantity.isNaN() || variantQuantity.signum() < 0)) {
                errors += RowError(rowNumber, "$sku: variantQuantity must be zero or more")
                continue
            }
            val variantPrice = num(cell("variantPrice"))
            if (variantPrice != null && (variantPrice.isNaN() || variantPrice.signum() <= 0)) {
                errors += RowError(rowNumber, "$sku: variantPrice must be a number above zero")
                continue
            }

            // A variant SKU is derived when the sheet does not carry one.
            val variantSku = text(cell("variantSku"))
                ?: listOfNotNull(sku, color, size).joinToString("-") { it.uppercase().replace(Regex("[^A-Z0-9]"), "") }

            val duplicate = product.variants.any {
                (it.color ?: "").equals(color ?: "", ignoreCase = true) && (it.size ?: "").equals(size ?: "", ignoreCase = true)
            }
            if (duplicate) {
                errors += RowError(rowNumber, "$sku: ${listOfNotNull(color, size).joinToString(" / ")} appears more than once")
                continue
            }

            product.variants += ParsedVariant(
                color = color,
                size = size,
                sku = variantSku,
                quantity = variantQuantity?.setScale(0, RoundingMode.DOWN)?.toInt() ?: 0,
                pricePaise = variantPrice?.let(::toPaise),
            )
        }

        // A variant SKU repeated across two products would collide on the unique index.
        val seenVariantSkus = HashMap<String, String>()
        for (product in byKey.values) {
            for (variant in product.variants) {
                val owner = seenVariantSkus[variant.sku.uppercase()]
                if (owner != null && owner != product.sku) {
                    errors += RowError(product.rows[0], "${product.sku}: variant SKU ${variant.sku} is already used by $owner")
                }
                seenVariantSkus[variant.sku.uppercase()] = product.sku
            }
        }

        return CsvParseResult(byKey.values.toList(), errors, ignoredColumns)
    }

    /** A slug from a name, matching what the product form generates. */
    fun slugify(value: String): String =
        Normalizer.normalize(value.lowercase(), Normalizer.Form.NFKD)
            .replace(Regex("[^a-z0-9\\s-]"), "")
            .trim()
            .replace(Regex("\\s+"), "-")
            .take(80)
            .ifEmpty { "product" }

    /** One CSV cell, quoted when it has to be. */
    fun csvCell(value: Any?): String {
        if (value == null) return ""
        val text = ProductSpec.text(value)
        return if (Regex("[\",\\n\\r]").containsMatchIn(text)) "\"${text.replace("\"", "\"\"")}\"" else text
    }

    /** A CSV document from rows of values. */
    fun toCsv(header: List<String>, rows: List<List<Any?>>): String =
        (listOf(header.joinToString(",")) + rows.map { row -> row.joinToString(",") { csvCell(it) } }).joinToString("\n")
}
