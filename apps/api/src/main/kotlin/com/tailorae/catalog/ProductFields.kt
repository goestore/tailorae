package com.tailorae.catalog

import com.tailorae.catalog.rules.CategoryFields
import com.tailorae.catalog.rules.ColourFamilies
import com.tailorae.catalog.rules.Picked
import com.tailorae.catalog.rules.ProductSpec

/**
 * Which request fields map to which columns, and how they are checked.
 *
 * Product and variant writes are partial (only what was sent changes, and an
 * explicit null clears a field), so bodies are read as JSON maps and whitelisted
 * here — the same contract as the legacy `pickProductFields`. The registry is
 * also the only source of column names for the dynamic INSERT/UPDATE, so a
 * request can never name a column of its own.
 */
internal enum class ColumnKind { TEXT, UUID, INT, LONG, BOOL, TEXT_ARRAY, JSON }

internal data class FieldDef(val name: String, val column: String, val kind: ColumnKind)

internal object ProductColumns {
    private fun f(name: String, column: String, kind: ColumnKind = ColumnKind.TEXT) = FieldDef(name, column, kind)

    /** Every writable product column. */
    val WRITABLE: List<FieldDef> = listOf(
        f("name", "name"), f("slug", "slug"), f("description", "description"), f("shortDescription", "short_description"),
        f("categoryId", "category_id", ColumnKind.UUID), f("brandId", "brand_id", ColumnKind.UUID),
        f("sku", "sku"), f("barcode", "barcode"), f("dimensions", "dimensions"), f("material", "material"),
        f("color", "color"), f("colorFamily", "color_family"), f("sizeGuide", "size_guide"), f("thumbnail", "thumbnail"),
        f("videoUrl", "video_url"), f("metaTitle", "meta_title"), f("metaDescription", "meta_description"),
        f("metaKeywords", "meta_keywords"), f("status", "status"), f("moderationStatus", "moderation_status"),
        f("moderationNote", "moderation_note"),
        f("pricePaise", "price_paise", ColumnKind.LONG), f("mrpPaise", "mrp_paise", ColumnKind.LONG),
        f("costPaise", "cost_paise", ColumnKind.LONG),
        f("quantity", "quantity", ColumnKind.INT), f("minOrderQuantity", "min_order_quantity", ColumnKind.INT),
        f("maxOrderQuantity", "max_order_quantity", ColumnKind.INT), f("weightGrams", "weight_grams", ColumnKind.INT),
        f("isFeatured", "is_featured", ColumnKind.BOOL), f("isCustomizable", "is_customizable", ColumnKind.BOOL),
        f("allowBulkOrders", "allow_bulk_orders", ColumnKind.BOOL),
        f("images", "images", ColumnKind.TEXT_ARRAY), f("colourHexes", "colour_hexes", ColumnKind.JSON),
        f("articleType", "article_type"), f("styleGroupId", "style_group_id"), f("colourGroupId", "colour_group_id"),
        f("displayName", "display_name"), f("listViewName", "list_view_name"), f("brandColour", "brand_colour"),
        f("primaryColour", "primary_colour"), f("secondaryColour", "secondary_colour"), f("tertiaryColour", "tertiary_colour"),
        f("ageGroup", "age_group"), f("fashionType", "fashion_type"), f("usage", "usage"), f("season", "season"),
        f("year", "year", ColumnKind.INT), f("hsn", "hsn"), f("countriesOfOrigin", "countries_of_origin", ColumnKind.TEXT_ARRAY),
        f("manufacturerDetails", "manufacturer_details"), f("packerDetails", "packer_details"),
        f("importerDetails", "importer_details"), f("styleNote", "style_note"), f("materialCare", "material_care"),
        f("sizeAndFit", "size_and_fit"), f("tags", "tags", ColumnKind.TEXT_ARRAY), f("measurementBasis", "measurement_basis"),
        f("netQuantity", "net_quantity", ColumnKind.INT), f("netQuantityUnit", "net_quantity_unit"),
        f("numberOfItems", "number_of_items"), f("multipackSet", "multipack_set"), f("packageContains", "package_contains"),
        f("bisCertificate", "bis_certificate", ColumnKind.JSON), f("imageAngles", "image_angles", ColumnKind.JSON),
        f("attributes", "attributes", ColumnKind.JSON),
    )

    /** Read-only columns returned alongside the writable ones. */
    val READ_ONLY: List<FieldDef> = listOf(
        f("id", "id", ColumnKind.UUID), f("sellerId", "seller_id", ColumnKind.UUID),
        f("rating", "rating"), f("ratingCount", "rating_count", ColumnKind.INT), f("reviewCount", "review_count", ColumnKind.INT),
    )

    val BY_NAME: Map<String, FieldDef> = WRITABLE.associateBy { it.name }

    /**
     * Fields whose change sends an approved seller listing back to review.
     * Price and stock are left out on purpose: sellers change those daily.
     */
    val NEEDS_REVIEW = listOf(
        "name", "description", "shortDescription", "images", "thumbnail", "videoUrl", "categoryId", "brandId",
        "material", "attributes", "imageAngles", "displayName", "styleNote",
    )

    /** What a shopper must never receive: the seller's margin and the moderation conversation. */
    val PRIVATE = setOf("costPaise", "moderationNote", "moderatedAt")

    val STATUSES = listOf("DRAFT", "ACTIVE", "INACTIVE", "DISCONTINUED")
}

internal object VariantColumns {
    private fun f(name: String, column: String, kind: ColumnKind = ColumnKind.TEXT) = FieldDef(name, column, kind)

    val WRITABLE: List<FieldDef> = listOf(
        f("name", "name"), f("sku", "sku"), f("size", "size"), f("color", "color"), f("material", "material"),
        f("pricePaise", "price_paise", ColumnKind.LONG), f("quantity", "quantity", ColumnKind.INT),
        f("standardSize", "standard_size"), f("sizeOnLabel", "size_on_label", ColumnKind.BOOL), f("gtin", "gtin"),
        f("measurements", "measurements", ColumnKind.JSON), f("options", "options", ColumnKind.JSON),
        f("colorFamily", "color_family"), f("weightGrams", "weight_grams", ColumnKind.INT),
        f("images", "images", ColumnKind.TEXT_ARRAY), f("isDefault", "is_default", ColumnKind.BOOL),
    )
    val BY_NAME: Map<String, FieldDef> = WRITABLE.associateBy { it.name }
}

/** Request-body pickers, ported from the legacy route helpers. */
internal object ProductInput {
    private val STRING_FIELDS = listOf(
        "name", "slug", "description", "shortDescription", "categoryId", "brandId", "sku", "barcode", "dimensions",
        "material", "color", "sizeGuide", "thumbnail", "videoUrl", "metaTitle", "metaDescription", "metaKeywords",
    )
    private val MONEY_FIELDS = listOf("pricePaise", "mrpPaise", "costPaise")
    private val INT_FIELDS = listOf("quantity", "minOrderQuantity", "maxOrderQuantity", "weightGrams")
    private val BOOL_FIELDS = listOf("isFeatured", "isCustomizable", "allowBulkOrders")
    private val LISTING_TEXT = linkedMapOf(
        "articleType" to 60, "styleGroupId" to 80, "colourGroupId" to 80, "displayName" to 200, "listViewName" to 120,
        "brandColour" to 80, "primaryColour" to 40, "secondaryColour" to 40, "tertiaryColour" to 40, "ageGroup" to 40,
        "fashionType" to 40, "usage" to 40, "season" to 40, "hsn" to 8, "manufacturerDetails" to 500,
        "packerDetails" to 500, "importerDetails" to 500, "styleNote" to 2000, "materialCare" to 1000,
        "sizeAndFit" to 1000, "measurementBasis" to 80, "netQuantityUnit" to 20, "numberOfItems" to 20,
        "multipackSet" to 20, "packageContains" to 200,
    )
    private val UUID_RE = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    private val HEX_RE = Regex("^#[0-9a-fA-F]{6}$")

    fun wholeNumber(value: Any?): Long? = when (value) {
        is Int, is Long, is Short -> (value as Number).toLong()
        is Number -> value.toDouble().takeIf { it.isFinite() && it == Math.floor(it) }?.toLong()
        is String -> value.trim().toLongOrNull()
        else -> null
    }

    fun pickProduct(body: Map<String, Any?>): Picked {
        val out = Picked()
        val data = out.data
        val errors = out.errors
        for (field in STRING_FIELDS) {
            if (!body.containsKey(field)) continue
            val value = body[field]
            when {
                value == null && field in setOf("brandId", "description", "shortDescription", "barcode", "dimensions",
                    "material", "color", "sizeGuide", "thumbnail", "videoUrl", "metaTitle", "metaDescription", "metaKeywords") -> data[field] = null
                value !is String -> errors += "$field must be a string"
                // "No brand" is a real choice in a form, and it arrives as an empty string.
                field == "brandId" && value.isBlank() -> data[field] = null
                (field == "categoryId" || field == "brandId") && !UUID_RE.matches(value.trim()) ->
                    errors += "$field does not match an existing ${if (field == "brandId") "brand" else "category"}"
                else -> data[field] = value.trim()
            }
        }
        for (field in MONEY_FIELDS) {
            if (!body.containsKey(field)) continue
            val value = body[field]
            if (value == null) { if (field != "pricePaise") data[field] = null; continue }
            val n = wholeNumber(value)
            if (n == null || n < 0) errors += "$field must be a whole number of paise, zero or more" else data[field] = n
        }
        for (field in INT_FIELDS) {
            if (!body.containsKey(field)) continue
            val value = body[field]
            if (value == null) { if (field == "maxOrderQuantity" || field == "weightGrams") data[field] = null; continue }
            val n = wholeNumber(value)
            if (n == null || n < 0 || n > Int.MAX_VALUE) errors += "$field must be a non-negative integer" else data[field] = n.toInt()
        }
        for (field in BOOL_FIELDS) {
            if (!body.containsKey(field)) continue
            val value = body[field]
            if (value !is Boolean) errors += "$field must be a boolean" else data[field] = value
        }
        if (body.containsKey("colourHexes")) {
            when (val raw = body["colourHexes"]) {
                null -> data["colourHexes"] = null
                !is Map<*, *> -> errors += "colourHexes must be an object of colour name to #RRGGBB"
                else -> {
                    val clean = LinkedHashMap<String, String>()
                    for ((name, hex) in raw) {
                        val key = name.toString().trim()
                        if (key.isEmpty()) continue
                        if (hex !is String || !HEX_RE.matches(hex.trim())) { errors += "Swatch for \"$key\" must be a colour like #1F2A44"; continue }
                        clean[key.take(60)] = hex.trim().uppercase()
                    }
                    data["colourHexes"] = clean.ifEmpty { null }
                }
            }
        }
        if (body.containsKey("colorFamily")) {
            val value = body["colorFamily"]
            if (value == null || value == "") data["colorFamily"] = null
            else {
                val family = (value as? String)?.let { ColourFamilies.canonical(it) }
                if (family == null) errors += "\"$value\" is not a colour family" else data["colorFamily"] = family.name
            }
        }
        if (body.containsKey("status")) {
            val value = body["status"]
            if (value !is String || value !in ProductColumns.STATUSES) errors += "status must be one of: ${ProductColumns.STATUSES.joinToString(", ")}"
            else data["status"] = value
        }
        if (body.containsKey("images")) {
            val value = body["images"]
            if (value !is List<*> || value.any { it !is String }) errors += "images must be an array of strings"
            else data["images"] = value.map { (it as String).trim() }.filter { it.isNotEmpty() }.take(20)
        }
        pickListing(body, data, errors)
        return out
    }

    private fun pickListing(body: Map<String, Any?>, data: MutableMap<String, Any?>, errors: MutableList<String>) {
        for ((field, max) in LISTING_TEXT) {
            if (!body.containsKey(field)) continue
            val value = body[field]
            when {
                value == null || value == "" -> data[field] = null
                value !is String -> errors += "$field must be a string"
                else -> data[field] = value.trim().take(max)
            }
        }
        for (field in listOf("year", "netQuantity")) {
            if (!body.containsKey(field)) continue
            val value = body[field]
            if (value == null || value == "") { data[field] = null; continue }
            val n = wholeNumber(value)
            if (n == null || n < 0 || n > 100_000) errors += "$field must be a whole number" else data[field] = n.toInt()
        }
        for (field in listOf("countriesOfOrigin", "tags")) {
            if (!body.containsKey(field)) continue
            val value = body[field]
            if (value !is List<*> || value.any { it !is String }) errors += "$field must be a list of text values"
            else data[field] = value.map { (it as String).trim() }.filter { it.isNotEmpty() }.distinct().take(if (field == "tags") 30 else 5)
        }
        if (body.containsKey("attributes")) {
            when (val value = body["attributes"]) {
                null -> data["attributes"] = linkedMapOf<String, Any?>()
                !is Map<*, *> -> errors += "attributes must be an object"
                else -> data["attributes"] = LinkedHashMap(value.entries.associate { it.key.toString() to it.value })
            }
        }
        if (body.containsKey("imageAngles")) {
            when (val value = body["imageAngles"]) {
                null -> data["imageAngles"] = null
                !is Map<*, *> -> errors += "imageAngles must be an object"
                else -> {
                    val angles = LinkedHashMap<String, String>()
                    for ((angle, url) in value) {
                        val name = angle.toString()
                        when {
                            name !in ProductSpec.ANGLE_ORDER -> errors += "$name is not an image angle"
                            url == null || url == "" -> {}
                            url !is String || url.length > 1000 -> errors += "$name image must be a URL"
                            else -> angles[name] = url
                        }
                    }
                    data["imageAngles"] = angles
                }
            }
        }
        if (body.containsKey("bisCertificate")) {
            when (val value = body["bisCertificate"]) {
                null -> data["bisCertificate"] = null
                !is Map<*, *> -> errors += "bisCertificate must be an object"
                else -> {
                    val clean = LinkedHashMap<String, String>()
                    for (key in listOf("number", "imageUrl", "expiryDate")) {
                        val v = value[key]
                        if (v is String && v.isNotBlank()) clean[key] = v.trim().take(500)
                    }
                    data["bisCertificate"] = clean.ifEmpty { null }
                }
            }
        }
    }

    /** One size of one colour. `allowDefault` is the admin's: which colour a shopper lands on is merchandising. */
    fun pickVariant(body: Map<String, Any?>, allowDefault: Boolean): Picked {
        val out = Picked()
        val data = out.data
        val errors = out.errors
        if (body.containsKey("name")) {
            val v = body["name"]
            if (v !is String || v.isBlank()) errors += "name must be a non-empty string" else data["name"] = v.trim().take(120)
        }
        if (body.containsKey("sku")) {
            val v = body["sku"]
            if (v !is String || v.isBlank()) errors += "sku must be a non-empty string" else data["sku"] = v.trim().uppercase().take(60)
        }
        for (field in listOf("size", "color", "material")) {
            if (!body.containsKey(field)) continue
            val v = body[field]
            when {
                v == null || v == "" -> data[field] = null
                v !is String -> errors += "$field must be a string"
                else -> data[field] = v.trim().take(60)
            }
        }
        if (body.containsKey("pricePaise")) {
            val v = body["pricePaise"]
            // Null means "same as the product".
            if (v == null || v == "") data["pricePaise"] = null
            else {
                val n = wholeNumber(v)
                if (n == null || n < 0) errors += "pricePaise must be a whole number of paise, zero or more" else data["pricePaise"] = n
            }
        }
        if (body.containsKey("quantity")) {
            val n = wholeNumber(body["quantity"])
            if (n == null || n < 0 || n > Int.MAX_VALUE) errors += "quantity must be a non-negative integer" else data["quantity"] = n.toInt()
        }
        if (body.containsKey("weightGrams")) {
            val v = body["weightGrams"]
            if (v == null) data["weightGrams"] = null
            else {
                val n = wholeNumber(v)
                if (n == null || n < 0 || n > Int.MAX_VALUE) errors += "weightGrams must be a non-negative integer" else data["weightGrams"] = n.toInt()
            }
        }
        if (body.containsKey("images")) {
            val v = body["images"]
            if (v !is List<*> || v.any { it !is String }) errors += "images must be an array of strings"
            // Six is the practical ceiling a colour gallery is designed around.
            else data["images"] = v.map { it as String }.take(6)
        }
        if (allowDefault && body.containsKey("isDefault")) {
            val v = body["isDefault"]
            if (v !is Boolean) errors += "isDefault must be a boolean" else data["isDefault"] = v
        }
        val listing = ProductSpec.pickVariantListingFields(body)
        data.putAll(listing.data)
        errors += listing.errors
        return out
    }

    /** Category fields; `partial` is an update, where only what was sent is checked. */
    fun pickCategory(body: Map<String, Any?>, partial: Boolean): Picked {
        val out = Picked()
        val data = out.data
        val errors = out.errors
        fun sent(key: String) = body.containsKey(key)
        if (!partial || sent("name")) {
            val name = (body["name"] as? String)?.trim()?.replace(Regex("\\s+"), " ") ?: ""
            if (name.isEmpty() || name.length > 80) errors += "name is required (at most 80 characters)" else data["name"] = name
        }
        if (!partial || sent("slug")) {
            val slug = (body["slug"] as? String)?.trim() ?: ""
            if (!Regex("^[a-z0-9-]{1,80}$").matches(slug)) errors += "slug must be lowercase letters, digits and hyphens" else data["slug"] = slug
        }
        for (field in listOf("description", "image", "icon")) {
            if (!sent(field)) continue
            when (val v = body[field]) {
                null, "" -> data[field] = null
                !is String -> errors += "$field must be text"
                else -> data[field] = v.trim().take(if (field == "description") 2000 else 500)
            }
        }
        if (sent("parentId")) {
            when (val v = body["parentId"]) {
                null, "" -> data["parentId"] = null
                !is String -> errors += "parentId must be a category id"
                else -> if (!UUID_RE.matches(v)) errors += "parentId does not match an existing category" else data["parentId"] = v
            }
        }
        for (field in listOf("displayOrder", "homeOrder")) {
            if (!sent(field)) continue
            val n = wholeNumber(body[field])
            if (n == null || n < -10_000 || n > 10_000) errors += "$field must be a whole number" else data[field] = n.toInt()
        }
        for (field in listOf("isActive", "showOnHome")) {
            if (!sent(field)) continue
            val v = body[field]
            if (v !is Boolean) errors += "$field must be true or false" else data[field] = v
        }
        if (sent("listingTemplate")) {
            when (val v = body["listingTemplate"]) {
                null, "" -> data["listingTemplate"] = null
                else -> {
                    val info = (v as? String)?.let { ProductSpec.templateInfo(it) }
                    if (info == null) errors += "listingTemplate must be one of the catalogue article types" else data["listingTemplate"] = info.slug
                }
            }
        }
        if (sent("commissionRateBp")) {
            when (val v = body["commissionRateBp"]) {
                null, "" -> data["commissionRateBp"] = null
                else -> {
                    val n = wholeNumber(v)
                    if (n == null || n < 0 || n > 10_000) errors += "commissionRateBp must be from 0 to 10000 (basis points)" else data["commissionRateBp"] = n.toInt()
                }
            }
        }
        if (sent("optionLabel")) {
            when (val v = body["optionLabel"]) {
                null, "" -> data["optionLabel"] = null
                else -> if (v !is String || v.trim().length > 40) errors += "optionLabel must be text of at most 40 characters"
                else data["optionLabel"] = v.trim().replace(Regex("\\s+"), " ").ifEmpty { null }
            }
        }
        if (sent("optionValues")) {
            val values = if (body["optionValues"] == null) emptyList() else CategoryFields.cleanOptions(body["optionValues"])
            if (values == null || values.size > 60) errors += "optionValues must be a list of at most 60 values" else data["optionValues"] = values
        }
        return out
    }

    fun pickBrand(body: Map<String, Any?>): Picked {
        val out = Picked()
        val data = out.data
        val errors = out.errors
        if (body.containsKey("name")) {
            val v = body["name"]
            if (v !is String || v.isBlank()) errors += "name must be a non-empty string" else data["name"] = v.trim().replace(Regex("\\s+"), " ").take(80)
        }
        if (body.containsKey("slug")) {
            val v = body["slug"]
            if (v !is String || v.isBlank()) errors += "slug must be a non-empty string"
            else data["slug"] = v.trim().lowercase().replace(Regex("[^a-z0-9-]+"), "-").take(80)
        }
        for (field in listOf("description", "logo", "banner", "metaTitle", "metaDescription")) {
            if (!body.containsKey(field)) continue
            when (val v = body[field]) {
                null, "" -> data[field] = null
                !is String -> errors += "$field must be a string"
                else -> data[field] = v.trim()
            }
        }
        for (field in listOf("isActive", "isFeatured")) {
            if (!body.containsKey(field)) continue
            val v = body[field]
            if (v !is Boolean) errors += "$field must be a boolean" else data[field] = v
        }
        if (body.containsKey("displayOrder")) {
            val n = wholeNumber(body["displayOrder"])
            if (n == null || n > Int.MAX_VALUE || n < Int.MIN_VALUE) errors += "displayOrder must be an integer" else data["displayOrder"] = n.toInt()
        }
        return out
    }

    data class CustomizationRow(
        val name: String, val type: String, val isRequired: Boolean, val options: List<String>?,
        val additionalPaise: Long, val maxCharacters: Int?,
    )

    private val CUSTOMIZATION_TYPES = listOf("TEXT", "COLOR", "IMAGE", "EMBROIDERY", "PRINT")

    fun parseCustomizations(raw: Any?): Pair<List<CustomizationRow>, List<String>> {
        if (raw !is List<*>) return emptyList<CustomizationRow>() to listOf("customizations must be an array")
        val errors = mutableListOf<String>()
        val rows = raw.mapIndexed { index, item ->
            val row = (item as? Map<*, *>) ?: emptyMap<String, Any?>()
            val label = "Option ${index + 1}"
            val name = (row["name"] as? String)?.trim().orEmpty()
            if (name.isEmpty()) errors += "$label: a name is required"
            val type = ((row["type"] as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: "text").uppercase()
            if (type !in CUSTOMIZATION_TYPES) errors += "$label: type must be text, color, image, embroidery or print"
            val cost = if (row["additionalPaise"] == null) 0L else wholeNumber(row["additionalPaise"]) ?: -1L
            if (cost < 0) errors += "$label: extra cost must be zero or more"
            val maxRaw = row["maxCharacters"]
            val max = if (maxRaw == null || maxRaw == "") null else wholeNumber(maxRaw)?.toInt() ?: -1
            if (max != null && max <= 0) errors += "$label: character limit must be a whole number above zero"
            val options = (row["options"] as? List<*>)?.filterIsInstance<String>()?.map { it.trim() }?.filter { it.isNotEmpty() }?.ifEmpty { null }
            CustomizationRow(name.take(120), type, row["isRequired"] == true, options, cost.coerceAtLeast(0), max)
        }
        return rows to errors
    }

    data class Tier(val minQty: Int, val maxQty: Int?, val discountBp: Int)

    /** Bulk price tiers, validated as a set: overlapping bands are the failure that matters. */
    fun parseTiers(raw: Any?): Pair<List<Tier>, List<String>> {
        if (raw !is List<*>) return emptyList<Tier>() to listOf("tiers must be an array")
        val errors = mutableListOf<String>()
        val tiers = raw.mapIndexed { index, item ->
            val row = (item as? Map<*, *>) ?: emptyMap<String, Any?>()
            val label = "Tier ${index + 1}"
            val min = wholeNumber(row["minQty"])?.toInt() ?: 0
            val maxRaw = row["maxQty"]
            val max = if (maxRaw == null || maxRaw == "") null else wholeNumber(maxRaw)?.toInt() ?: -1
            val discount = wholeNumber(row["discountBp"])?.toInt() ?: 0
            if (min < 2) errors += "$label: the minimum quantity must be a whole number of 2 or more"
            if (max != null && max < min) errors += "$label: the maximum must be a whole number no lower than the minimum"
            if (discount <= 0 || discount >= 10_000) errors += "$label: the discount must be between 0% and 100% (1 to 9999 basis points)"
            Tier(min, max, discount)
        }.sortedBy { it.minQty }
        for (i in 1 until tiers.size) {
            val previous = tiers[i - 1]
            if (previous.maxQty == null || tiers[i].minQty <= previous.maxQty) {
                errors += "Tiers overlap: the band starting at ${tiers[i].minQty} is already covered by the one starting at ${previous.minQty}"
                break
            }
        }
        return tiers to errors
    }
}
