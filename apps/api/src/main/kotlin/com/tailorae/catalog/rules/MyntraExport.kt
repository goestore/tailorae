package com.tailorae.catalog.rules

import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.ss.usermodel.Sheet
import org.apache.poi.ss.usermodel.Workbook
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.math.BigDecimal

/**
 * A product written back out as Myntra's own SKU template (port of
 * legacy-api/src/utils/myntra-export.ts). The inverse of the importer: one
 * row per size, every value where the catalogue says its column is.
 */
object MyntraExport {
    /** The template rows: banner, section band, header; data starts below (1-based). */
    const val HEADER_ROW = 3
    const val FIRST_DATA_ROW = 4

    private val ANGLE_ORDER = ProductSpec.ANGLE_ORDER

    /** Image angles, falling back to the gallery in angle order for products listed before angles existed. */
    fun anglesOf(product: Map<String, Any?>): Map<String, String> {
        val angles = LinkedHashMap<String, String>()
        for ((angle, url) in Values.map(product["imageAngles"])) if (url is String && url.isNotEmpty()) angles[angle] = url
        if (angles.isNotEmpty()) return angles
        val gallery = (listOf(product["thumbnail"]) + Values.list(product["images"]))
            .filterIsInstance<String>().filter { it.isNotEmpty() }.distinct()
        gallery.take(ANGLE_ORDER.size).forEachIndexed { index, url -> angles[ANGLE_ORDER[index]] = url }
        return angles
    }

    /** A relative upload path made absolute, because Myntra fetches images from the URL. */
    fun absoluteUrl(url: String, base: String): String =
        if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(url)) url
        else "${base.trimEnd('/')}/${url.trimStart('/')}"

    /** Paise as the rupee figure a sheet shows: whole rupees as a Long, else a Double. */
    private fun rupees(paise: Number): Number {
        val value = BigDecimal.valueOf(paise.toLong()).movePointLeft(2)
        return if (value.stripTrailingZeros().scale() <= 0) value.toLong() else value.toDouble()
    }

    private fun positive(value: Any?): Long? = (value as? Number)?.toLong()?.takeIf { it > 0 }

    /** The value one template column takes for one size of one product. */
    fun cellFor(column: SpecColumn, product: Map<String, Any?>, variant: Map<String, Any?>?, assetBase: String): Any? {
        fun text(value: Any?): Any? = when (value) {
            null, "" -> null
            is String, is Number -> value
            is Boolean -> value.toString()
            else -> value.toString()
        }
        return when (column.scope) {
            "product" -> {
                val field = column.field ?: return null
                when (field) {
                    "styleGroupId" -> text(product["styleGroupId"]) ?: product["sku"]
                    "brand" -> text(Values.map(product["brand"])["name"])
                    // MRP is mandatory; a product sold at full price has no compare price stored.
                    "mrpPaise" -> (positive(product["mrpPaise"]) ?: positive(product["pricePaise"]))?.let(::rupees)
                    "pricePaise" -> (positive(variant?.get("pricePaise")) ?: positive(product["pricePaise"]))?.let(::rupees)
                    "tags" -> Values.list(product["tags"]).takeIf { it.isNotEmpty() }?.joinToString(", ")
                    else -> {
                        val parts = field.split(".", limit = 2)
                        if (parts.size == 1) text(product[field])
                        else if (parts[0] == "countriesOfOrigin") text(Values.list(product["countriesOfOrigin"]).getOrNull(parts[1].toInt()))
                        else text(Values.map(product[parts[0]])[parts[1]])
                    }
                }
            }
            "variant" -> {
                if (variant == null || column.field == null) return null
                if (column.field == "sizeOnLabel") {
                    when (variant["sizeOnLabel"]) {
                        true -> "Yes"
                        false -> "No"
                        else -> null
                    }
                } else {
                    text(variant[column.field])
                }
            }
            "attribute" -> Values.map(product["attributes"])[column.key].let { v -> if (v is List<*>) v.joinToString(",") else text(v) }
            "measurement" -> {
                val value = Values.map(variant?.get("measurements"))[column.key]
                if (value is Number) value else text(value)
            }
            "image" -> anglesOf(product)[column.key]?.let { absoluteUrl(it, assetBase) }
            else -> null
        }
    }

    /** The tab that holds the listing rows: the one whose header row carries vendorSkuCode. */
    private fun listingSheet(workbook: Workbook): Sheet? {
        for (i in 0 until workbook.numberOfSheets) {
            val sheet = workbook.getSheetAt(i)
            val row = sheet.getRow(HEADER_ROW - 1) ?: continue
            for (cell in row) {
                if (cell.cellType == CellType.STRING && cell.stringCellValue.trim() == "vendorSkuCode") return sheet
            }
        }
        return null
    }

    /**
     * Fill the template with these products and return the workbook bytes and
     * how many rows were written. Column positions are read from the template's
     * own header row; its sample rows are cleared first (styling kept), and the
     * masterdata and instruction tabs are left exactly as Myntra shipped them.
     */
    fun buildWorkbook(spec: ArticleTypeSpec, products: List<Map<String, Any?>>, assetBase: String): Pair<ByteArray, Int> {
        val template = spec.template ?: throw IllegalArgumentException("The ${spec.articleType} type has no Myntra template")
        val stream = MyntraExport::class.java.classLoader.getResourceAsStream("catalog/myntra-templates/$template")
            ?: throw IllegalStateException("catalog/myntra-templates/$template is missing from the classpath")
        XSSFWorkbook(stream.use { it.readAllBytes() }.inputStream()).use { workbook ->
            val sheet = listingSheet(workbook) ?: throw IllegalStateException("The ${spec.articleType} template has no listing tab")

            val header = sheet.getRow(HEADER_ROW - 1)
            val columnByHeader = LinkedHashMap<String, Int>()
            for (cell in header) {
                val text = if (cell.cellType == CellType.STRING) cell.stringCellValue.trim() else ""
                if (text.isNotEmpty()) columnByHeader.putIfAbsent(text, cell.columnIndex)
            }

            // Clear the sample data the template ships with; keep the cells' styling.
            for (r in (FIRST_DATA_ROW - 1)..sheet.lastRowNum) {
                val row = sheet.getRow(r) ?: continue
                for (cell in row) cell.setBlank()
            }

            val placed = spec.columns.mapNotNull { column -> columnByHeader[column.header]?.let { column to it } }

            var r = FIRST_DATA_ROW - 1
            for (product in products) {
                val variants = Values.list(product["variants"]).filterIsInstance<Map<String, Any?>>()
                val sizes: List<Map<String, Any?>?> = variants.ifEmpty { listOf(null) }
                for (variant in sizes) {
                    val row = sheet.getRow(r) ?: sheet.createRow(r)
                    for ((column, index) in placed) {
                        val value = cellFor(column, product, variant, assetBase) ?: continue
                        val cell = row.getCell(index) ?: row.createCell(index)
                        when (value) {
                            is Number -> cell.setCellValue(value.toDouble())
                            else -> cell.setCellValue(value.toString())
                        }
                    }
                    r += 1
                }
            }

            val out = ByteArrayOutputStream()
            workbook.write(out)
            return out.toByteArray() to (r - (FIRST_DATA_ROW - 1))
        }
    }
}
