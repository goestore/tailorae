package com.tailorae.catalog.rules

/**
 * Reading a listing sheet somebody else's system produced (port of
 * legacy-api/src/utils/sheet-columns.ts).
 *
 * Myntra's SKU template has a version banner on row 1, section headings on
 * row 2 and the real header on row 3, so the header is found rather than
 * assumed, and column names are matched through aliases.
 */
object SheetColumns {
    /** Header text reduced to something matchable: case, punctuation and bracketed units ignored. */
    fun normaliseHeader(v: Any?): String =
        (v?.toString() ?: "").lowercase()
            .replace("&", "and")
            .replace(Regex("\\(.*?\\)"), "")
            .replace(Regex("[^a-z0-9]+"), "")

    private val ALIASES = LinkedHashMap<String, String>()

    private fun alias(field: String, vararg names: String) {
        for (name in names) ALIASES[normaliseHeader(name)] = field
    }

    init {
        // The product a shopper buys, and the SKU beneath it.
        alias("articleNumber", "vendorArticleNumber", "modelNo", "model number", "styleCode", "articleNumber", "parentSku")
        alias("sku", "vendorSkuCode", "sku", "skuCode", "variantSku", "childSku")
        alias("name", "vendorArticleName", "name", "productName", "styleId", "title")
        alias("displayName", "productDisplayName", "listViewName", "displayName")
        alias("brand", "brand", "brandName")
        alias("category", "articleType", "category", "productType")
        alias("subcategory", "subCategory", "subcategory")
        // Size and colour.
        alias("size", "brandSize", "size")
        alias("standardSize", "standardSize")
        alias("colorName", "brandColourRemarks", "brandColour", "brandColor", "colour", "color", "colourName", "colorName")
        alias("primaryColor", "prominentColour", "prominentColor", "primaryColour", "primaryColor")
        alias("secondaryColor", "secondProminentColour", "secondProminentColor", "secondaryColour", "secondaryColor")
        alias("colorGroupKey", "colorVariantGroupId", "colourVariantGroupId", "styleGroupId", "productGroupKey")
        // Money and stock.
        alias("mrp", "mrp", "maximumRetailPrice", "originalPrice", "comparePrice")
        alias("sellingPrice", "isp", "sellingPrice", "price", "ourPrice")
        alias("costPrice", "costPrice", "cost")
        alias("stock", "stock", "quantity", "qty", "inventory", "variantQuantity")
        alias("status", "status", "isActive", "active")
        // Copy.
        alias("description", "productDetails", "description", "longDescription")
        alias("shortDescription", "styleNote", "shortDescription", "sizeAndFitDescription")
        alias("material", "fabric", "material", "fabricType")
        alias("fabricCare", "materialCareDescription", "washCare", "fabricCare", "careInstructions")
        alias("metaTitle", "seoTitle", "metaTitle")
        alias("metaDescription", "seoDescription", "metaDescription")
        alias("searchKeywords", "tags", "searchKeywords", "keywords")
        // Compliance.
        alias("hsn", "hsn", "hsnCode", "taxCode")
        alias("gtin", "gtin", "ean", "barcode", "upc")
        alias("countryOfOrigin", "countryOfOrigin")
        alias("manufacturer", "ManufacturerNameandAddresswithPincode", "manufacturer", "manufacturerDetails")
        alias("packer", "PackerNameandAddresswithPincode", "packer")
        alias("importer", "ImporterNameandAddresswithPincode", "importer")
        alias("packageContains", "packageContains", "netQuantity", "numberOfItems")
        alias("weight", "weight", "netWeight")
        // Attributes a shopper filters and reads.
        alias("occasion", "occasion", "usage")
        alias("pattern", "pattern")
        alias("patternType", "printOrPatternType", "patternType")
        alias("neckType", "neck", "neckType", "neckline")
        alias("sleeveLength", "sleeveLength")
        alias("sleeveStyle", "sleeveStyling", "sleeveStyle")
        alias("productLength", "length", "productLength")
        alias("fit", "shape", "fit")
        alias("hemline", "hemline")
        alias("closure", "closure")
        alias("lining", "lining")
        alias("transparency", "transparency")
        alias("ageGroup", "ageGroup")
        alias("season", "season")
        alias("year", "year")
        // Images.
        alias("image1", "frontImage", "image1", "image", "mainImage")
        alias("image2", "backImage", "image2")
        alias("image3", "sideImage", "image3")
        alias("image4", "detailAngle", "image4")
        alias("image5", "lookShotImage", "image5")
        alias("image6", "additionalImage1", "image6")
        // Measurements, per size — these become the size chart.
        alias("measureBust", "bustInches", "bust", "toFitBustInches")
        alias("measureChest", "chestInches", "chest")
        alias("measureWaist", "waistInches", "waist", "toFitWaistInches")
        alias("measureHips", "hipsInches", "hips", "toFitHipInches")
        alias("measureFrontLength", "frontLengthInches", "frontLength")
        alias("measureShoulder", "acrossShoulderInches", "acrossShoulder", "shoulder")
        alias("measureSleeveLength", "sleeveLengthInches")
    }

    /** The field a header maps to, or null when nothing recognises it. */
    fun fieldForHeader(h: Any?): String? = ALIASES[normaliseHeader(h)]

    /** Every canonical field, for the mapping screen to offer when a column is unrecognised. */
    val CANONICAL_FIELDS: List<String> = ALIASES.values.distinct().sorted()

    /** How well a row reads as a header: distinct recognised fields. */
    fun headerScore(cells: List<Any?>): Int = cells.mapNotNull { fieldForHeader(it) }.toSet().size

    /** The header row within the first [limit] rows; at least three distinct fields, else -1. */
    fun findHeaderRow(matrix: List<List<Any?>>, limit: Int = 25): Int {
        var bestIndex = -1
        var bestScore = 0
        for (i in 0 until minOf(limit, matrix.size)) {
            val score = headerScore(matrix[i])
            if (score > bestScore) {
                bestScore = score
                bestIndex = i
            }
        }
        return if (bestScore >= 3) bestIndex else -1
    }

    /** Tabs that are never product rows (Myntra's instructions and 43,000-row masterdata). */
    val META_SHEET = Regex("^__|instruction|masterdata|dropdown|reference|readme|help|lookup|guideline", RegexOption.IGNORE_CASE)
}
