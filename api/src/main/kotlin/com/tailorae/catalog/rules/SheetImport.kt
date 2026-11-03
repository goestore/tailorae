package com.tailorae.catalog.rules

import org.apache.poi.ss.usermodel.Cell
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.ss.usermodel.DateUtil
import org.apache.poi.ss.usermodel.Sheet
import org.apache.poi.ss.usermodel.WorkbookFactory
import java.io.ByteArrayInputStream
import java.math.BigDecimal
import java.time.ZoneOffset

data class Issue(
    /** error | warning */
    val level: String,
    val code: String,
    val message: String,
)

/** Per-size cells of a marketplace template row. */
data class VariantListingCells(
    var standardSize: String? = null,
    var sizeOnLabel: Boolean? = null,
    var gtin: String? = null,
)

/** One row of a marketplace template, split the way the catalogue scopes it. */
data class RowListing(
    val articleType: String,
    /** Product columns by field (dotted fields already nested). */
    val product: MutableMap<String, Any?> = linkedMapOf(),
    val attributes: MutableMap<String, String> = linkedMapOf(),
    val variant: VariantListingCells = VariantListingCells(),
    val measurements: MutableMap<String, String> = linkedMapOf(),
    val imageAngles: MutableMap<String, String> = linkedMapOf(),
)

/** One row of the sheet, as the importer understands it. */
data class ImportRow(
    /** 1-based position among the sheet's non-empty rows. */
    val rowNumber: Int,
    val sheet: String,
    val file: String,
    /** Canonical field → cell text. */
    val values: Map<String, String>,
    /** Present only when the sheet is a template for a known article type. */
    val listing: RowListing? = null,
    val issues: MutableList<Issue> = mutableListOf(),
)

data class ParsedSheet(
    val file: String,
    val sheet: String,
    /** Header cells as written, for the mapping screen. */
    val headers: List<String>,
    /** Headers nothing recognised — offered for manual mapping. */
    val unmapped: List<String>,
    /** The catalogue article type the sheet was read as, when it is a known template. */
    val articleType: String?,
    val rows: List<ImportRow>,
)

/** A measurement row for the size chart: which size, and its inches. */
data class SizeMeasurements(
    val size: String,
    val bust: Double? = null,
    val chest: Double? = null,
    val waist: Double? = null,
    val hips: Double? = null,
    val frontLength: Double? = null,
    val shoulder: Double? = null,
    val sleeveLength: Double? = null,
)

data class NormalisedVariant(
    val sku: String,
    val size: String,
    val colorName: String,
    val stock: Int,
    /** A per-size price that differs from the product's; null inherits it. */
    val pricePaise: Long?,
    val rowNumber: Int,
    val measurements: SizeMeasurements? = null,
    val standardSize: String? = null,
    val sizeOnLabel: Boolean? = null,
    val gtin: String? = null,
    /** Catalogue measurement key → inches, e.g. { bustIn: 34 }. */
    val measurementValues: Map<String, Double>? = null,
)

data class NormalisedProduct(
    /** The article number (or the SKU) plus colour. */
    val key: String,
    val articleNumber: String,
    val name: String,
    val displayName: String? = null,
    val brand: String? = null,
    val category: String? = null,
    val colorName: String,
    val pricePaise: Long,
    val mrpPaise: Long?,
    val description: String? = null,
    val shortDescription: String? = null,
    val material: String? = null,
    val fabricCare: String? = null,
    val hsn: String? = null,
    val countryOfOrigin: String? = null,
    val manufacturer: String? = null,
    val metaTitle: String? = null,
    val metaDescription: String? = null,
    val searchKeywords: String? = null,
    /** Catalogue key → value for a template; readable label → value for any other sheet. */
    val attributes: Map<String, String> = emptyMap(),
    val articleType: String? = null,
    /** Product listing columns by field: hsn, countriesOfOrigin, packerDetails… */
    val listing: Map<String, Any?> = emptyMap(),
    /** Image angle → URL, in the template's own angle names. */
    val imageAngles: Map<String, String>? = null,
    val images: List<String> = emptyList(),
    val variants: List<NormalisedVariant> = emptyList(),
    val issues: List<Issue> = emptyList(),
    val rows: List<Int> = emptyList(),
)

data class SanitisedListing(val product: Map<String, Any?>, val attributes: Map<String, String>, val issues: List<Issue>)

data class VariantListing(
    val standardSize: String? = null,
    val sizeOnLabel: Boolean? = null,
    val gtin: String? = null,
    val measurementValues: Map<String, Double>? = null,
    val issues: List<Issue> = emptyList(),
)

/**
 * A listing sheet, turned into products (port of legacy-api/src/utils/sheet-import.ts).
 *
 * Never refuse a row for something that can be worked out or safely defaulted,
 * but say what was assumed: a missing category is left for the operator, a
 * missing colour becomes "Assorted", a missing size is read out of the SKU.
 * Only things nobody can guess — no SKU, no name, no price — are errors.
 */
object SheetImport {
    val IMAGE_ANGLE_ORDER = listOf("front", "back", "side", "detail", "lookShot", "additional1", "additional2")

    /** Product columns a listing may set; anything else in a payload is ignored. */
    val LISTING_FIELDS = listOf(
        "styleGroupId", "displayName", "listViewName", "brandColour", "primaryColour", "secondaryColour",
        "tertiaryColour", "ageGroup", "fashionType", "usage", "season", "year", "hsn", "countriesOfOrigin",
        "manufacturerDetails", "packerDetails", "importerDetails", "styleNote", "materialCare", "sizeAndFit",
        "tags", "measurementBasis", "netQuantity", "netQuantityUnit", "numberOfItems", "multipackSet",
        "packageContains", "bisCertificate",
    )
    private val LISTING_FIELD_SET = LISTING_FIELDS.toSet()

    /** A catalogue sheet carries no stock column; this is what a new size starts at. */
    const val DEFAULT_STOCK = 0

    /** Product fields the generic columns already carry, so the listing does not repeat them. */
    private val BASE_PRODUCT_FIELDS = setOf("sku", "name", "brand", "pricePaise", "mrpPaise", "description")

    private val YES = Regex("^(yes|y|true|1)$", RegexOption.IGNORE_CASE)
    private val NO = Regex("^(no|n|false|0)$", RegexOption.IGNORE_CASE)
    private val NOT_APPLICABLE = Regex("^(na|n/a|-)$", RegexOption.IGNORE_CASE)

    internal fun clean(value: Any?): String =
        (if (value == null) "" else ProductSpec.text(value)).replace(Regex("[` ]"), " ").trim()

    private fun isNotApplicable(value: Any?) = value is String && NOT_APPLICABLE.matches(value.trim())

    private fun invalid(message: String) = Issue("warning", "invalid_value", message)

    // ── Reading ──────────────────────────────────────────────────────────

    /** A cell's text: formulas by their cached result, dates as yyyy-MM-dd, whole numbers without ".0". */
    private fun cellText(cell: Cell?): String {
        if (cell == null) return ""
        fun numeric(): String =
            if (DateUtil.isCellDateFormatted(cell)) {
                cell.dateCellValue.toInstant().atZone(ZoneOffset.UTC).toLocalDate().toString()
            } else {
                val n = cell.numericCellValue
                if (n % 1.0 == 0.0 && Math.abs(n) < 1e15) n.toLong().toString() else BigDecimal.valueOf(n).stripTrailingZeros().toPlainString()
            }
        fun of(type: CellType): String = when (type) {
            CellType.STRING -> cell.richStringCellValue.string
            CellType.NUMERIC -> numeric()
            CellType.BOOLEAN -> cell.booleanCellValue.toString()
            else -> ""
        }
        val text = when (cell.cellType) {
            CellType.FORMULA -> of(cell.cachedFormulaResultType)
            else -> of(cell.cellType)
        }
        return clean(text)
    }

    /** Rows of a worksheet as a plain matrix, capped so a reference tab cannot hang the request. */
    private fun sheetMatrix(sheet: Sheet, maxRows: Int): List<List<String>> {
        var columns = 1
        for (row in sheet) columns = maxOf(columns, row.lastCellNum.toInt())
        val matrix = mutableListOf<List<String>>()
        for (row in sheet) {
            if (matrix.size >= maxRows) break
            val cells = (0 until columns).map { cellText(row.getCell(it)) }
            if (cells.all { it.isEmpty() }) continue
            matrix += cells
        }
        return matrix
    }

    /**
     * Which catalogue article type a sheet is, if any: named by its tab or its
     * `articleType` column, and only when at least ten of its headers are that
     * template's own.
     */
    private fun detectArticleType(sheet: String, headers: List<String>, body: List<List<String>>): ArticleTypeSpec? {
        val typeIndex = headers.indexOfFirst { SheetColumns.normaliseHeader(it) == "articletype" }
        val fromColumn = if (typeIndex >= 0) body.map { clean(it.getOrNull(typeIndex)) }.firstOrNull { it.isNotEmpty() } else null
        val spec = Catalogue.find(fromColumn) ?: Catalogue.find(sheet) ?: return null
        val known = spec.columns.map { SheetColumns.normaliseHeader(it.header) }.toSet()
        val matched = headers.count { SheetColumns.normaliseHeader(it) in known }
        return if (matched >= 10) spec else null
    }

    /** Column index per catalogue column, by exact header first, then by normalised header. */
    private fun catalogueIndex(spec: ArticleTypeSpec, headers: List<String>): List<Pair<SpecColumn, Int>> {
        val exact = HashMap<String, Int>()
        val loose = HashMap<String, Int>()
        headers.forEachIndexed { index, header ->
            exact.putIfAbsent(header, index)
            loose.putIfAbsent(SheetColumns.normaliseHeader(header), index)
        }
        return spec.columns.mapNotNull { column ->
            (exact[column.header] ?: loose[SheetColumns.normaliseHeader(column.header)])?.let { column to it }
        }
    }

    /** One row through the catalogue: every column lands where its scope says. */
    private fun readListing(spec: ArticleTypeSpec, columns: List<Pair<SpecColumn, Int>>, cells: List<String>): RowListing {
        val listing = RowListing(spec.articleType)
        val countries = sortedMapOf<Int, String>()
        for ((column, index) in columns) {
            val value = clean(cells.getOrNull(index))
            if (value.isEmpty()) continue
            when (column.scope) {
                "product" -> {
                    val field = column.field ?: continue
                    if (field in BASE_PRODUCT_FIELDS) continue
                    val parts = field.split(".", limit = 2)
                    if (parts.size == 1) {
                        listing.product.putIfAbsent(field, value)
                    } else if (parts[0] == "countriesOfOrigin") {
                        countries[parts[1].toInt()] = value
                    } else {
                        @Suppress("UNCHECKED_CAST")
                        val bag = (listing.product[parts[0]] as? MutableMap<String, Any?>) ?: linkedMapOf<String, Any?>().also { listing.product[parts[0]] = it }
                        bag[parts[1]] = value
                    }
                }
                "attribute" -> listing.attributes[column.key] = value
                "variant" -> when (column.field) {
                    "standardSize" -> listing.variant.standardSize = value
                    "gtin" -> listing.variant.gtin = value
                    "sizeOnLabel" -> when {
                        YES.matches(value) -> listing.variant.sizeOnLabel = true
                        NO.matches(value) -> listing.variant.sizeOnLabel = false
                    }
                }
                "measurement" -> listing.measurements[column.key] = value
                "image" -> if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(value) || value.startsWith("/")) {
                    listing.imageAngles[column.key] = value
                }
            }
        }
        if (countries.isNotEmpty()) listing.product["countriesOfOrigin"] = countries.values.filter { it.isNotEmpty() }
        return listing
    }

    /** Turn a matrix into rows keyed by canonical field. */
    private fun matrixToRows(matrix: List<List<String>>, file: String, sheet: String, overrides: Map<String, String>): ParsedSheet {
        val headerIndex = SheetColumns.findHeaderRow(matrix)
        if (headerIndex < 0) return ParsedSheet(file, sheet, emptyList(), emptyList(), null, emptyList())

        val headers = matrix[headerIndex].map { clean(it) }
        val mapped = headers.map { overrides[it] ?: SheetColumns.fieldForHeader(it) }
        val spec = detectArticleType(sheet, headers, matrix.drop(headerIndex + 1))
        val specColumns = spec?.let { catalogueIndex(it, headers) } ?: emptyList()
        val covered = specColumns.map { it.second }.toSet()
        val unmapped = headers.filterIndexed { index, header -> header.isNotEmpty() && mapped[index] == null && index !in covered }

        val rows = mutableListOf<ImportRow>()
        for (i in headerIndex + 1 until matrix.size) {
            val cells = matrix[i]
            if (cells.none { clean(it).isNotEmpty() }) continue
            val values = LinkedHashMap<String, String>()
            mapped.forEachIndexed { index, field ->
                if (field == null) return@forEachIndexed
                val value = clean(cells.getOrNull(index))
                // First non-empty wins.
                if (value.isNotEmpty() && field !in values) values[field] = value
            }
            rows += ImportRow(i + 1, sheet, file, values, spec?.let { readListing(it, specColumns, cells) })
        }
        return ParsedSheet(file, sheet, headers, unmapped, spec?.articleType, rows)
    }

    /**
     * Read one uploaded file. For a workbook the tab is chosen by how well its
     * best header row reads, so Myntra's "Dresses" wins over its instruction and
     * reference tabs.
     */
    fun parseSheet(bytes: ByteArray, filename: String, overrides: Map<String, String> = emptyMap(), maxRows: Int = 20000): ParsedSheet {
        if (filename.lowercase().endsWith(".csv")) {
            return matrixToRows(CatalogCsv.parseCsv(String(bytes, Charsets.UTF_8)), filename, "csv", overrides)
        }
        WorkbookFactory.create(ByteArrayInputStream(bytes)).use { workbook ->
            val all = (0 until workbook.numberOfSheets).map { workbook.getSheetAt(it) }
            val candidates = all.filter { !SheetColumns.META_SHEET.containsMatchIn(it.sheetName) }.ifEmpty { all }
            var best: ParsedSheet? = null
            var bestScore = -1
            for (sheet in candidates) {
                val matrix = sheetMatrix(sheet, maxRows)
                val index = SheetColumns.findHeaderRow(matrix)
                val score = if (index >= 0) SheetColumns.headerScore(matrix[index]) else 0
                if (score > bestScore) {
                    bestScore = score
                    best = matrixToRows(matrix, filename, sheet.sheetName, overrides)
                }
            }
            return best ?: ParsedSheet(filename, "", emptyList(), emptyList(), null, emptyList())
        }
    }

    // ── Normalising ──────────────────────────────────────────────────────

    /** Size suffixes recognised at the end of a SKU, longest first so XXL beats L. */
    private val SIZE_SUFFIXES = listOf(
        "10XL", "9XL", "8XL", "7XL", "6XL", "5XL", "4XL", "3XL", "2XL", "XXXL",
        "XXL", "XXS", "XL", "XS", "FS", "L", "M", "S",
        "46", "44", "42", "40", "38", "36", "34", "32", "30", "28",
    ).sortedByDescending { it.length }

    /**
     * The size a SKU is for: what follows the article number, or failing that a
     * known suffix. Empty rather than an invented size.
     */
    fun sizeFromSku(sku: String, articleNumber: String? = null): String {
        val skuText = clean(sku)
        if (skuText.isEmpty()) return ""
        val article = clean(articleNumber)
        if (article.isNotEmpty() && skuText.uppercase().startsWith("${article.uppercase()}-")) return skuText.substring(article.length + 1)
        val upper = skuText.uppercase()
        for (suffix in SIZE_SUFFIXES) if (upper.endsWith("-$suffix")) return skuText.takeLast(suffix.length)
        return ""
    }

    private fun toNumber(value: String?): Double? {
        val text = clean(value)
        if (text.isEmpty()) return null
        return text.replace(Regex("[₹,\\s]"), "").toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    private fun toPaise(rupees: Double): Long = CatalogCsv.toPaise(BigDecimal.valueOf(rupees))

    /** Title Case, for a category or colour taken straight from a sheet. */
    fun titleCase(value: String): String =
        clean(value).lowercase().replace(Regex("\\b\\w")) { it.value.uppercase() }

    /**
     * Normalise listing values against the catalogue, one field at a time. A
     * value that is not one of the template's options is dropped and reported,
     * never allowed to fail the whole product. Idempotent.
     */
    fun sanitiseListing(articleType: String?, product: Map<String, Any?>, attributes: Map<String, Any?> = emptyMap()): SanitisedListing {
        val issues = mutableListOf<Issue>()
        val out = LinkedHashMap<String, Any?>()
        val spec = Catalogue.find(articleType)

        for ((field, raw) in product) {
            if (field !in LISTING_FIELD_SET || raw == null || raw == "") continue
            when (field) {
                "countriesOfOrigin" -> {
                    val list = (if (raw is List<*>) raw else raw.toString().split(",")).map { clean(it) }
                        .filter { it.isNotEmpty() && !isNotApplicable(it) }
                    val kept = mutableListOf<String>()
                    for (country in list) {
                        val data: MutableMap<String, Any?> = linkedMapOf("countriesOfOrigin" to listOf(country))
                        if (ProductSpec.validateListingValues(data, articleType).isNotEmpty()) {
                            issues += invalid("Country of origin \"$country\" is not one Myntra accepts — left out")
                        } else {
                            kept += (data["countriesOfOrigin"] as List<*>)[0].toString()
                        }
                    }
                    if (kept.isNotEmpty()) out["countriesOfOrigin"] = kept.distinct()
                }
                "tags" -> {
                    val tags = (if (raw is List<*>) raw else raw.toString().split(",")).map { clean(it) }
                        .filter { it.isNotEmpty() && !isNotApplicable(it) }
                    if (tags.isNotEmpty()) out["tags"] = tags
                }
                "bisCertificate" -> {
                    if (raw is Map<*, *>) {
                        val bag = LinkedHashMap<String, String>()
                        for (key in listOf("number", "imageUrl", "expiryDate")) {
                            val value = clean(raw[key])
                            if (value.isNotEmpty() && !isNotApplicable(value)) bag[key] = value
                        }
                        if (bag.isNotEmpty()) out["bisCertificate"] = bag
                    }
                }
                "netQuantity" -> {
                    val n = clean(raw).toDoubleOrNull()
                    if (n != null && n % 1.0 == 0.0 && n > 0) out["netQuantity"] = n.toInt()
                    else if (!isNotApplicable(raw)) issues += invalid("Net quantity \"${clean(raw)}\" is not a whole number — left blank")
                }
                else -> {
                    // Excel hands a numeric HSN back as a number; it is a code, not an amount.
                    val text = if (field == "hsn") clean(raw).replace(Regex("\\.0+$"), "") else clean(raw).take(2000)
                    if (text.isEmpty()) continue
                    val data: MutableMap<String, Any?> = linkedMapOf(field to text)
                    val errors = ProductSpec.validateListingValues(data, articleType)
                    if (errors.isNotEmpty()) {
                        if (!isNotApplicable(text)) issues += invalid("${errors[0]} (got \"$text\") — left blank")
                        continue
                    }
                    if (field == "year") {
                        val year = ProductSpec.text(data["year"]).toDoubleOrNull()
                        if (year != null && year % 1.0 == 0.0) out["year"] = year.toInt()
                        continue
                    }
                    if (isNotApplicable(text)) {
                        // A free-text field holding "NA" has nothing to store; a dropdown may list NA.
                        val column = spec?.columns?.firstOrNull { it.field == field }
                        if (column?.options == null) continue
                    }
                    out[field] = data[field]
                }
            }
        }

        val attrsOut = LinkedHashMap<String, String>()
        for ((key, raw) in attributes) {
            val text = clean(raw)
            if (text.isEmpty()) continue
            val data: MutableMap<String, Any?> = linkedMapOf("attributes" to linkedMapOf<String, Any?>(key to text))
            val errors = ProductSpec.validateListingValues(data, articleType)
            if (errors.isNotEmpty()) {
                if (!isNotApplicable(text)) issues += invalid("${errors[0]} (got \"$text\") — left blank")
                continue
            }
            val value = Values.map(data["attributes"])[key]
            if (value == null || value == "") continue
            // A free-text attribute of "NA" carries nothing.
            val column = spec?.columns?.firstOrNull { it.key == key }
            if (isNotApplicable(text) && column?.options == null) continue
            attrsOut[key] = if (value is List<*>) value.joinToString(",") else ProductSpec.text(value)
        }
        return SanitisedListing(out, attrsOut, issues)
    }

    /** Per-size listing values, checked the way the listing form checks them. */
    fun sanitiseVariantListing(standardSize: Any?, sizeOnLabel: Any?, gtin: Any?, measurements: Map<String, Any?>?): VariantListing {
        val issues = mutableListOf<Issue>()
        val standard = clean(standardSize).takeIf { it.isNotEmpty() && !isNotApplicable(it) }?.take(40)
        val label = sizeOnLabel as? Boolean
        val gtinText = clean(gtin).replace(Regex("\\.0+$"), "")
        var gtinOut: String? = null
        if (gtinText.isNotEmpty() && !isNotApplicable(gtinText)) {
            val picked = ProductSpec.pickVariantListingFields(mapOf("gtin" to gtinText))
            if (picked.errors.isNotEmpty()) issues += invalid("GTIN \"$gtinText\" must be 8, 12, 13 or 14 digits — left blank")
            else gtinOut = picked.data["gtin"] as String
        }
        val measured = LinkedHashMap<String, Double>()
        for ((key, raw) in measurements ?: emptyMap()) {
            val text = clean(raw)
            if (text.isEmpty() || isNotApplicable(text)) continue
            val picked = ProductSpec.pickVariantListingFields(mapOf("measurements" to mapOf(key to text)))
            if (picked.errors.isNotEmpty()) issues += invalid("Measurement $key \"$text\" is not a number of inches — left blank")
            else @Suppress("UNCHECKED_CAST") measured.putAll(picked.data["measurements"] as Map<String, Double>)
        }
        return VariantListing(standard, label, gtinOut, measured.takeIf { it.isNotEmpty() }, issues)
    }

    /** The product as it would be stored, in the shape the go-live checklist reads. */
    fun listingSnapshot(p: NormalisedProduct): Map<String, Any?> {
        val out = LinkedHashMap<String, Any?>(p.listing)
        out["articleType"] = p.articleType
        out["name"] = p.name
        out["sku"] = p.articleNumber
        // The brand is resolved (or created) on commit, so its name stands in for the id.
        out["brandId"] = p.brand?.takeIf { it.isNotEmpty() }
        out["description"] = p.description
        out["pricePaise"] = p.pricePaise
        out["mrpPaise"] = p.mrpPaise
        out["attributes"] = p.attributes
        out["imageAngles"] = p.imageAngles ?: emptyMap<String, String>()
        out["variants"] = p.variants.map { v ->
            mapOf(
                "size" to v.size, "sku" to v.sku, "standardSize" to v.standardSize, "sizeOnLabel" to v.sizeOnLabel,
                "gtin" to v.gtin, "measurements" to (v.measurementValues ?: emptyMap()),
            )
        }
        return out
    }

    /** What still stops this product going live; empty for sheets with no article type. */
    fun missingForLiveOf(p: NormalisedProduct, extraColumns: List<SpecColumn> = emptyList()): List<MissingField> =
        if (p.articleType != null) ProductSpec.missingForLive(listingSnapshot(p), extraColumns) else emptyList()

    /** Generic columns that are listing fields too, for sheets that are not a known template. */
    private fun genericListing(value: (String) -> String?): MutableMap<String, Any?> {
        val listing = LinkedHashMap<String, Any?>()
        fun put(field: String, raw: String?) {
            val text = clean(raw)
            if (text.isNotEmpty() && !isNotApplicable(text)) listing[field] = text
        }
        put("hsn", value("hsn"))
        put("manufacturerDetails", value("manufacturer"))
        put("packerDetails", value("packer"))
        put("importerDetails", value("importer"))
        put("materialCare", value("fabricCare"))
        put("primaryColour", value("primaryColor"))
        put("secondaryColour", value("secondaryColor"))
        put("styleGroupId", value("colorGroupKey"))
        val country = clean(value("countryOfOrigin"))
        if (country.isNotEmpty()) listing["countriesOfOrigin"] = country.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        return listing
    }

    /** Attribute columns kept as a named bag rather than given their own field. */
    private val ATTRIBUTE_FIELDS = listOf(
        "occasion", "pattern", "patternType", "neckType", "sleeveLength", "sleeveStyle",
        "productLength", "fit", "hemline", "closure", "lining", "transparency",
        "ageGroup", "season", "year", "packageContains", "subcategory",
    )
    private val ATTRIBUTE_LABELS = mapOf(
        "patternType" to "Print or pattern", "neckType" to "Neck", "sleeveLength" to "Sleeve length",
        "sleeveStyle" to "Sleeve styling", "productLength" to "Length", "ageGroup" to "Age group",
        "packageContains" to "Package contains", "subcategory" to "Sub-category",
    )

    private class Builder(
        val key: String,
        val articleNumber: String,
        val name: String,
        val displayName: String?,
        val brand: String?,
        val category: String?,
        val colorName: String,
        val pricePaise: Long,
        val mrpPaise: Long?,
        val text: (String) -> String?,
        val attributes: Map<String, String>,
        val articleType: String?,
        val listing: Map<String, Any?>,
        val imageAngles: Map<String, String>?,
        val images: List<String>,
        val issues: MutableList<Issue>,
    ) {
        val description = text("description")
        val shortDescription = text("shortDescription")
        val material = text("material")
        val fabricCare = text("fabricCare")
        val hsn = text("hsn")
        val countryOfOrigin = text("countryOfOrigin")
        val manufacturer = text("manufacturer")
        val metaTitle = text("metaTitle")
        val metaDescription = text("metaDescription")
        val searchKeywords = text("searchKeywords")
        val variants = mutableListOf<NormalisedVariant>()
        val rows = mutableListOf<Int>()

        fun build() = NormalisedProduct(
            key, articleNumber, name, displayName, brand, category, colorName, pricePaise, mrpPaise,
            description, shortDescription, material, fabricCare, hsn, countryOfOrigin, manufacturer,
            metaTitle, metaDescription, searchKeywords, attributes, articleType, listing, imageAngles,
            images, variants.toList(), issues.toList(), rows.toList(),
        )
    }

    /**
     * Group rows into products, defaulting what can be defaulted. One product
     * per article number and colour, its sizes underneath.
     */
    fun normaliseRows(rows: List<ImportRow>): List<NormalisedProduct> {
        val byKey = LinkedHashMap<String, Builder>()

        for (row in rows) {
            fun value(field: String): String? = row.values[field]
            val issues = mutableListOf<Issue>()

            val sku = clean(value("sku"))
            val articleNumber = clean(value("articleNumber"))
            val name = clean(value("name")).ifEmpty { clean(value("displayName")) }

            if (sku.isEmpty() && articleNumber.isEmpty()) {
                row.issues += Issue("error", "no_sku", "No SKU or article number"); continue
            }
            if (name.isEmpty()) {
                row.issues += Issue("error", "no_name", "No product name"); continue
            }

            val mrp = toNumber(value("mrp"))
            val selling = toNumber(value("sellingPrice"))
            val price = selling ?: mrp
            if (price == null || price <= 0) {
                row.issues += Issue("error", "no_price", "No price or MRP on this row"); continue
            }
            if (selling != null && mrp != null && selling > mrp) {
                issues += Issue("warning", "price_above_mrp", "Selling price is above MRP")
            }

            // Size: the column, else read out of the SKU, else the product has one size.
            var size = clean(value("size")).ifEmpty { clean(value("standardSize")) }
            if (size.isEmpty()) {
                size = sizeFromSku(sku, articleNumber)
                if (size.isNotEmpty()) issues += Issue("warning", "size_from_sku", "Size \"$size\" read from the SKU")
            }
            if (size.isEmpty()) size = "One size"

            var colorName = clean(value("colorName"))
            if (colorName.isEmpty()) {
                colorName = clean(value("primaryColor"))
                if (colorName.isNotEmpty()) issues += Issue("warning", "color_from_prominent", "Colour taken from the prominent colour: $colorName")
            }
            if (colorName.isEmpty()) {
                colorName = "Assorted"
                issues += Issue("warning", "color_defaulted", "No colour on this row — filed as Assorted")
            }

            val category = clean(value("category"))
            if (category.isEmpty()) {
                issues += Issue("warning", "no_category", "No category — one must be chosen before this can go live")
            }

            val stockValue = toNumber(value("stock"))
            val stock = stockValue?.toInt() ?: DEFAULT_STOCK
            if (stockValue == null) {
                issues += Issue("warning", "stock_defaulted", "No stock column — starts at 0, so it will not sell until set")
            }
            if (stock < 0) {
                row.issues += Issue("error", "negative_stock", "Stock is negative"); continue
            }

            // One product per article per colour.
            val groupKey = articleNumber.ifEmpty { sku.replace(Regex("-${Regex.escape(size)}$", RegexOption.IGNORE_CASE), "") }.uppercase()
            val key = "$groupKey::${colorName.uppercase()}"

            var product = byKey[key]
            if (product == null) {
                val attributes = LinkedHashMap<String, String>()
                for (field in ATTRIBUTE_FIELDS) {
                    val attributeValue = clean(value(field))
                    if (attributeValue.isEmpty() || attributeValue.uppercase() == "NA") continue
                    attributes[ATTRIBUTE_LABELS[field] ?: titleCase(field)] = attributeValue
                }
                var images = listOf("image1", "image2", "image3", "image4", "image5", "image6")
                    .map { clean(value(it)) }
                    .filter { Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(it) }

                var listing: Map<String, Any?> = genericListing(::value)
                var articleType: String? = null
                var imageAngles: Map<String, String>? = null
                var productAttributes: Map<String, String> = attributes
                val listingIssues = mutableListOf<Issue>()
                val template = row.listing
                if (template != null) {
                    articleType = template.articleType
                    val sanitised = sanitiseListing(articleType, LinkedHashMap(listing).apply { putAll(template.product) }, template.attributes)
                    listing = sanitised.product
                    productAttributes = sanitised.attributes
                    listingIssues += sanitised.issues
                    imageAngles = LinkedHashMap(template.imageAngles)
                    val ordered = IMAGE_ANGLE_ORDER.mapNotNull { imageAngles[it] }
                    if (ordered.isNotEmpty()) images = ordered
                }

                product = Builder(
                    key = key,
                    articleNumber = articleNumber.ifEmpty { groupKey },
                    name = name,
                    displayName = clean(value("displayName")).ifEmpty { null },
                    brand = clean(value("brand")).ifEmpty { null },
                    category = category.ifEmpty { null },
                    colorName = colorName,
                    pricePaise = toPaise(price),
                    mrpPaise = mrp?.let(::toPaise),
                    text = { field -> clean(value(field)).ifEmpty { null } },
                    attributes = productAttributes,
                    articleType = articleType,
                    listing = listing,
                    imageAngles = imageAngles,
                    images = images,
                    issues = listingIssues,
                )
                byKey[key] = product
            }

            product.rows += row.rowNumber
            // One warning per product per kind.
            for (issue in issues) if (product.issues.none { it.code == issue.code }) product.issues += issue

            fun measure(field: String) = toNumber(value(field))
            val measurements = SizeMeasurements(
                size = size,
                bust = measure("measureBust"),
                chest = measure("measureChest"),
                waist = measure("measureWaist"),
                hips = measure("measureHips"),
                frontLength = measure("measureFrontLength"),
                shoulder = measure("measureShoulder"),
                sleeveLength = measure("measureSleeveLength"),
            )
            val hasMeasurements = listOf(
                measurements.bust, measurements.chest, measurements.waist, measurements.hips,
                measurements.frontLength, measurements.shoulder, measurements.sleeveLength,
            ).any { it != null }

            val variantSku = sku.ifEmpty { "${product.articleNumber}-$size".uppercase() }
            if (product.variants.any { it.sku.equals(variantSku, ignoreCase = true) }) {
                row.issues += Issue("error", "duplicate_sku", "SKU $variantSku appears twice"); continue
            }

            val template = row.listing
            val variantListing = if (template != null) {
                sanitiseVariantListing(template.variant.standardSize, template.variant.sizeOnLabel, template.variant.gtin, template.measurements)
            } else {
                sanitiseVariantListing(value("standardSize"), null, value("gtin"), null)
            }
            for (found in variantListing.issues) if (product.issues.none { it.message == found.message }) product.issues += found

            val rowPrice = toPaise(price)
            product.variants += NormalisedVariant(
                sku = variantSku,
                size = size,
                colorName = colorName,
                stock = stock,
                // A size priced differently from the product keeps its own price.
                pricePaise = if (rowPrice != product.pricePaise) rowPrice else null,
                rowNumber = row.rowNumber,
                measurements = if (hasMeasurements) measurements else null,
                standardSize = variantListing.standardSize,
                sizeOnLabel = variantListing.sizeOnLabel,
                gtin = variantListing.gtin,
                measurementValues = variantListing.measurementValues,
            )
        }
        return byKey.values.map { it.build() }
    }

    /**
     * A size chart from per-size measurements: only the measurements this sheet
     * actually carried, "Size · Chest (in) · Waist (in)" then one line per size.
     */
    fun sizeChartFrom(variants: List<NormalisedVariant>): String {
        val rows = variants.filter { it.measurements != null }
        if (rows.isEmpty()) return ""
        val all: List<Pair<String, (SizeMeasurements) -> Double?>> = listOf(
            "Bust" to { it.bust }, "Chest" to { it.chest }, "Waist" to { it.waist }, "Hips" to { it.hips },
            "Shoulder" to { it.shoulder }, "Length" to { it.frontLength }, "Sleeve" to { it.sleeveLength },
        )
        val columns = all.filter { (_, read) -> rows.any { read(it.measurements!!) != null } }
        if (columns.isEmpty()) return ""
        val header = (listOf("Size") + columns.map { "${it.first} (in)" }).joinToString(" · ")
        val body = rows.map { row ->
            (listOf(row.measurements!!.size) + columns.map { (_, read) -> read(row.measurements)?.let(ProductSpec::text) ?: "—" }).joinToString(" · ")
        }
        return (listOf(header) + body).joinToString("\n")
    }
}
