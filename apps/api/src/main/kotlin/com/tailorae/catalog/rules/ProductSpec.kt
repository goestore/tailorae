package com.tailorae.catalog.rules

import com.tailorae.common.ApiException
import org.springframework.http.HttpStatus

data class ArticleTypeSummary(
    val articleType: String,
    val slug: String,
    val family: String,
    val optionLabel: String,
    val columns: Int,
    val required: Int,
)

/** How the storefront presents a product of this type. */
data class TemplateInfo(
    val articleType: String,
    val slug: String,
    val family: String,
    val optionLabel: String,
    val attributeLabels: Map<String, String>,
    /** Units of number attributes, so the spec table reads "55 inch". */
    val attributeUnits: Map<String, String>,
)

data class FilterableAttribute(
    val key: String,
    val label: String,
    val options: List<String>,
    val kind: String,
    val unit: String? = null,
)

data class ColumnSource(val categoryId: String, val categoryName: String)

/** A column as the listing form renders it, with its dropdown resolved. */
data class SpecColumnView(
    val key: String,
    val header: String,
    val label: String,
    val group: String,
    val required: Boolean,
    val kind: String,
    val scope: String,
    val field: String? = null,
    val options: List<String>? = null,
    val anyOf: List<String>? = null,
    val filterable: Boolean = false,
    val unit: String? = null,
    val helpText: String? = null,
    val source: ColumnSource? = null,
)

data class ArticleSpecView(
    val articleType: String,
    val slug: String,
    val family: String,
    val optionLabel: String,
    val sizes: List<String>,
    /** No list means the seller types the option values ("128 GB", "Large"). */
    val freeOptions: Boolean,
    /** Quick picks for a free option ("32 inch", "43 inch"). */
    val optionValues: List<String>,
    val columns: List<SpecColumnView>,
)

data class MissingField(val key: String, val label: String, val group: String)

private fun liveCheckMessage(missing: List<MissingField>): String {
    val n = missing.size
    return "This listing is not ready to go live: $n required field${if (n == 1) " is" else "s are"} missing. Save it as a draft or fill them in."
}

/** A listing about to go ACTIVE that still lacks required fields. */
class LiveCheckException(val missing: List<MissingField>) : ApiException(HttpStatus.CONFLICT, liveCheckMessage(missing))

/**
 * What a marketplace listing must contain, per article type (port of
 * legacy-api/src/utils/product-spec.ts).
 *
 * Two jobs: validate values as they are saved (a select must be one of the
 * template's options, an attribute must belong to the article type), and say
 * what is still missing before a product may go live. Drafts can be
 * incomplete; ACTIVE cannot.
 */
object ProductSpec {
    /** Images every live listing needs, whatever the template marks. */
    private val ALWAYS_REQUIRED_IMAGES = setOf("front")
    private val HSN_RE = Regex("^\\d{4,8}$")
    private val GTIN_RE = Regex("^(\\d{8}|\\d{12}|\\d{13}|\\d{14})$")
    private val NUMBER_RE = Regex("^\\d+(\\.\\d+)?$")
    private val MEASUREMENT_KEY_RE = Regex("^[a-zA-Z0-9]{1,60}$")
    private val YES = setOf("yes", "true", "1")
    private val NO = setOf("no", "false", "0")
    val ANGLE_ORDER = listOf("front", "back", "side", "detail", "lookShot", "additional1", "additional2")

    /**
     * The template's columns with the category's fields laid over them. A
     * category field with a template attribute's key replaces it; the rest are
     * appended after the template's attributes.
     */
    fun withCategoryColumns(columns: List<SpecColumn>, extra: List<SpecColumn>): List<SpecColumn> {
        if (extra.isEmpty()) return columns
        val byKey = extra.associateBy { it.key }
        val merged = columns.map { c -> if (c.scope == "attribute" && c.key in byKey) byKey.getValue(c.key) else c }.toMutableList()
        val used = merged.map { it.key }.toSet()
        val lastAttribute = merged.indexOfLast { it.scope == "attribute" }
        val rest = extra.filter { it.key !in used }
        merged.addAll(if (lastAttribute < 0) merged.size else lastAttribute + 1, rest)
        return merged
    }

    fun listArticleTypes(): List<ArticleTypeSummary> = Catalogue.articleTypes.map { t ->
        ArticleTypeSummary(t.articleType, t.slug, t.family, t.optionLabel, t.columns.count { it.scope != "ignore" }, requiredColumns(t).size)
    }

    /** The variant option name a category gives its products; clothing keeps "Size". */
    private fun optionLabelOf(spec: ArticleTypeSpec, extras: CategoryExtras?): String =
        if (spec.family == "general" && !extras?.optionLabel.isNullOrEmpty()) extras!!.optionLabel!! else spec.optionLabel

    fun templateInfo(nameOrSlug: String?, extras: CategoryExtras? = null): TemplateInfo? {
        val spec = Catalogue.find(nameOrSlug) ?: return null
        val attributes = withCategoryColumns(spec.columns, extras?.columns ?: emptyList()).filter { it.scope == "attribute" }
        return TemplateInfo(
            articleType = spec.articleType,
            slug = spec.slug,
            family = spec.family,
            optionLabel = optionLabelOf(spec, extras),
            attributeLabels = attributes.associate { it.key to it.label },
            attributeUnits = attributes.filter { it.unit != null }.associate { it.key to it.unit!! },
        )
    }

    /**
     * Every attribute some template marks filterable (or the category's own
     * filterable fields, listed first so they replace a template key).
     */
    fun filterableAttributes(templateKey: String? = null, extraColumns: List<SpecColumn> = emptyList()): List<FilterableAttribute> {
        val types = if (!templateKey.isNullOrEmpty()) listOfNotNull(Catalogue.find(templateKey)) else Catalogue.articleTypes
        val seen = LinkedHashMap<String, FilterableAttribute>()
        for (column in extraColumns + types.flatMap { it.columns }) {
            if (column.scope != "attribute" || !column.filterable || column.key in seen) continue
            seen[column.key] = FilterableAttribute(column.key, column.label, Catalogue.optionsFor(column), column.kind, column.unit)
        }
        return seen.values.toList()
    }

    private fun hasOptions(column: SpecColumn) = column.options != null || column.values != null

    /** The spec the listing form renders: columns with their options resolved. */
    fun articleSpec(nameOrSlug: String, extras: CategoryExtras? = null): ArticleSpecView? {
        val spec = Catalogue.find(nameOrSlug) ?: return null
        return ArticleSpecView(
            articleType = spec.articleType,
            slug = spec.slug,
            family = spec.family,
            optionLabel = optionLabelOf(spec, extras),
            sizes = spec.sizes?.let { Catalogue.lists[it] } ?: emptyList(),
            freeOptions = spec.sizes == null,
            optionValues = if (spec.sizes == null && spec.family == "general") extras?.optionValues ?: emptyList() else emptyList(),
            columns = withCategoryColumns(spec.columns, extras?.columns ?: emptyList())
                .filter { it.scope != "ignore" }
                .map { c ->
                    SpecColumnView(
                        key = c.key, header = c.header, label = c.label, group = c.group, required = c.required,
                        kind = c.kind, scope = c.scope, field = c.field,
                        options = if (hasOptions(c)) Catalogue.optionsFor(c) else null,
                        anyOf = c.anyOf, filterable = c.filterable, unit = c.unit, helpText = c.helpText,
                        source = c.sourceCategoryId?.let { ColumnSource(it, c.sourceCategoryName ?: "") },
                    )
                },
        )
    }

    internal fun requiredColumns(spec: ArticleTypeSpec, extra: List<SpecColumn> = emptyList()): List<SpecColumn> {
        val required = withCategoryColumns(spec.columns, extra).filter {
            it.scope != "ignore" && (it.required || (it.scope == "image" && it.key in ALWAYS_REQUIRED_IMAGES))
        }
        // An either-or pair counts once, under its first member.
        return required.filter { c ->
            c.anyOf?.none { key -> required.any { r -> r.key == key && required.indexOf(r) < required.indexOf(c) } } ?: true
        }
    }

    // ── Validation of submitted values ─────────────────────────────────

    /** Case-insensitive match against a dropdown; returns the list's own spelling. */
    private fun canonical(value: String, options: List<String>): String? {
        val v = value.trim().lowercase()
        return options.firstOrNull { it.lowercase() == v }
    }

    /** A value as JavaScript's String() writes it: 12.0 → "12". */
    internal fun text(value: Any?): String = when (value) {
        null -> ""
        is Double -> if (value % 1.0 == 0.0 && value.isFinite()) value.toLong().toString() else value.toString()
        is Float -> text(value.toDouble())
        is java.math.BigDecimal -> value.stripTrailingZeros().toPlainString()
        else -> value.toString()
    }

    /**
     * Check listing values against the article type's dropdowns and rules, and
     * normalise them in place (e.g. "cotton" → "Cotton"). Unknown attribute keys
     * are refused; product columns the type lacks are allowed through.
     */
    fun validateListingValues(
        data: MutableMap<String, Any?>,
        articleTypeName: String?,
        extraColumns: List<SpecColumn> = emptyList(),
        storedAttributes: Map<String, Any?>? = null,
    ): List<String> {
        val errors = mutableListOf<String>()
        if (data["articleType"] != null) {
            val found = Catalogue.find(data["articleType"].toString())
            if (found == null) {
                errors += "articleType must be one of: ${Catalogue.articleTypes.joinToString(", ") { it.articleType }}"
                return errors
            }
            data["articleType"] = found.articleType
        }
        val spec = Catalogue.find((data["articleType"] as? String) ?: articleTypeName)

        val hsn = data["hsn"]
        if (hsn is String && hsn.isNotEmpty() && !HSN_RE.matches(hsn)) errors += "HSN must be 4 to 8 digits"

        if (spec == null) {
            // A category's own fields can be filled in without a template.
            if (data["attributes"] != null) {
                if (extraColumns.isNotEmpty()) validateAttributes(data, extraColumns, "this category", "the listed options", storedAttributes, errors)
                else errors += "Choose an article type before setting attributes"
            }
            return errors
        }
        val optionsOf = if (spec.family == "apparel") "Myntra's options" else "the listed options"

        for (column in spec.columns) {
            val field = column.field
            if (column.scope != "product" || field == null || column.options == null) continue
            if (field.startsWith("countriesOfOrigin.")) continue
            val value = data[field]
            if (value == null || value == "") continue
            val match = canonical(text(value), Catalogue.optionsFor(column))
            if (match == null) errors += "${column.label} must be one of $optionsOf"
            else data[field] = if (field == "year") match.toDoubleOrNull()?.toInt() ?: match else match
        }

        val countries = data["countriesOfOrigin"]
        if (countries is List<*>) {
            val countryColumn = spec.columns.firstOrNull { it.field == "countriesOfOrigin.0" }
            val options = countryColumn?.let { Catalogue.optionsFor(it) } ?: emptyList()
            data["countriesOfOrigin"] = countries.map { raw ->
                val country = text(raw)
                val match = if (options.isNotEmpty()) canonical(country, options) else country
                if (match == null) errors += "$country is not a country Myntra accepts"
                match ?: country
            }
        }

        if (data["attributes"] != null) {
            validateAttributes(data, withCategoryColumns(spec.columns, extraColumns), spec.articleType, optionsOf, storedAttributes, errors)
        }
        return errors
    }

    private fun validateAttributes(
        data: MutableMap<String, Any?>,
        columns: List<SpecColumn>,
        owner: String,
        optionsOf: String,
        storedAttributes: Map<String, Any?>?,
        errors: MutableList<String>,
    ) {
        val raw = data["attributes"]
        if (raw !is Map<*, *>) {
            errors += "attributes must be an object of field to value"
            return
        }
        val attrs = LinkedHashMap<String, Any?>()
        raw.forEach { (k, v) -> attrs[k.toString()] = v }
        val stored = storedAttributes ?: emptyMap()
        val known = columns.filter { it.scope == "attribute" }.associateBy { it.key }
        for ((key, value) in attrs.entries.toList()) {
            val column = known[key]
            if (column == null) {
                if (stored.containsKey(key) && Values.jsonEquals(stored[key], value)) continue
                errors += "$key is not an attribute of $owner"
                continue
            }
            if (value == null || value == "" || (value is List<*> && value.isEmpty())) {
                attrs.remove(key)
                continue
            }
            if (column.kind == "multiselect") {
                // A list, or one string with commas ("HDMI, USB").
                val list: List<Any?>? = when (value) {
                    is List<*> -> value
                    is String -> value.split(",")
                    else -> null
                }
                if (list == null || list.any { it !is String }) {
                    errors += "${column.label} must be a list of options"
                    continue
                }
                val picked = mutableListOf<String>()
                for (item in list.map { it as String }) {
                    if (item.isBlank()) continue
                    val match = canonical(item, Catalogue.optionsFor(column))
                    if (match == null) errors += "${column.label}: ${item.trim()} is not one of $optionsOf"
                    else if (match !in picked) picked += match
                }
                attrs[key] = picked
                continue
            }
            if (column.kind == "boolean") {
                // Stored as the words a shopper reads, so the spec table and the filter both say "Yes".
                val word = text(value).trim().lowercase()
                val yes = if (value is Boolean) value else word in YES
                val no = if (value is Boolean) !value else word in NO
                when {
                    yes -> attrs[key] = "Yes"
                    no -> attrs[key] = "No"
                    else -> errors += "${column.label} must be yes or no"
                }
                continue
            }
            if (value !is String && value !is Number) {
                errors += "${column.label} must be text"
                continue
            }
            val txt = text(value).trim().take(500)
            if (hasOptions(column)) {
                val match = canonical(txt, Catalogue.optionsFor(column))
                if (match == null) errors += "${column.label} must be one of $optionsOf" else attrs[key] = match
            } else if (column.kind == "number") {
                val n = txt.toDoubleOrNull()
                if (!NUMBER_RE.matches(txt) || n == null || !n.isFinite() || n > 100000) errors += "${column.label} must be a number"
                else attrs[key] = text(n)
            } else {
                attrs[key] = txt
            }
        }
        data["attributes"] = attrs
    }

    /** Per-size listing values: standard size, label flag, GTIN, options, colour family, measurements. */
    fun pickVariantListingFields(body: Map<String, Any?>): Picked {
        val out = Picked()
        val data = out.data
        val errors = out.errors
        if (body.containsKey("standardSize")) {
            val v = body["standardSize"]
            when {
                v == null || v == "" -> data["standardSize"] = null
                v !is String -> errors += "standardSize must be a string"
                else -> data["standardSize"] = v.trim().take(40)
            }
        }
        if (body.containsKey("sizeOnLabel")) {
            val v = body["sizeOnLabel"]
            if (v != null && v !is Boolean) errors += "sizeOnLabel must be true or false" else data["sizeOnLabel"] = v
        }
        if (body.containsKey("gtin")) {
            val v = body["gtin"]
            when {
                v == null || v == "" -> data["gtin"] = null
                v !is String || !GTIN_RE.matches(v.trim()) -> errors += "GTIN must be 8, 12, 13 or 14 digits"
                else -> data["gtin"] = v.trim()
            }
        }
        if (body.containsKey("options")) {
            val v = body["options"]
            when {
                v == null -> data["options"] = null
                v !is Map<*, *> -> errors += "options must be an object of option name to value"
                else -> {
                    val clean = LinkedHashMap<String, String>()
                    for ((name, value) in v) {
                        if (value == null || value == "") continue
                        val label = name.toString().trim().take(40)
                        if (label.isEmpty() || (value !is String && value !is Number)) errors += "option $name must have a text value"
                        else clean[label] = text(value).trim().take(80)
                    }
                    if (clean.size > 5) errors += "a variant can carry at most 5 options" else data["options"] = clean
                }
            }
        }
        if (body.containsKey("colorFamily")) {
            val v = body["colorFamily"]
            when {
                v == null || v == "" -> data["colorFamily"] = null
                v !is String || ColourFamilies.canonical(v) == null -> errors += "\"${text(v)}\" is not a colour family"
                else -> data["colorFamily"] = ColourFamilies.canonical(v)!!.name
            }
        }
        if (body.containsKey("measurements")) {
            val v = body["measurements"]
            when {
                v == null -> data["measurements"] = null
                v !is Map<*, *> -> errors += "measurements must be an object of numbers"
                else -> {
                    val clean = LinkedHashMap<String, Double>()
                    for ((rawKey, value) in v) {
                        if (value == null || value == "") continue
                        val key = rawKey.toString()
                        val n = Values.number(value)
                        if (!MEASUREMENT_KEY_RE.matches(key) || n == null || !n.isFinite() || n < 0 || n > 200) {
                            errors += "measurement $key must be a number of inches from 0 to 200"
                        } else {
                            clean[key] = Math.round(n * 100) / 100.0
                        }
                    }
                    data["measurements"] = clean
                }
            }
        }
        return out
    }

    // ── Go-live checklist ──────────────────────────────────────────────

    private fun productValue(product: Map<String, Any?>, field: String): Any? {
        if (field == "brand") return product["brandId"]
        // The style group defaults to the article number, so it is never asked for twice.
        if (field == "styleGroupId") return product["styleGroupId"] ?: product["sku"]
        if (field == "pricePaise" || field == "mrpPaise") {
            val n = Values.number(product[field]) ?: return null
            return if (n > 0) n else null
        }
        val parts = field.split(".", limit = 2)
        val value = product[parts[0]]
        if (parts.size == 1) return value
        val tail = parts[1]
        return when (value) {
            is List<*> -> tail.toIntOrNull()?.let { value.getOrNull(it) }
            is Map<*, *> -> value[tail]
            else -> null
        }
    }

    /** "Bust or Chest (in)" for an either-or pair, else the column's own label. */
    private fun measurementLabel(spec: ArticleTypeSpec, column: SpecColumn): String {
        if (column.anyOf.isNullOrEmpty()) return column.label
        val names = (listOf(column) + column.anyOf.mapNotNull { key -> spec.columns.firstOrNull { it.key == key } })
            .map { it.label.replace(Regex("\\s*\\(\\s*in(ches)?\\s*\\)$", RegexOption.IGNORE_CASE), "") }
        return "${names.joinToString(" or ")} (in)"
    }

    /** Everything a live listing of this type still lacks. Empty means ready. */
    fun missingForLive(product: Map<String, Any?>, extraColumns: List<SpecColumn> = emptyList()): List<MissingField> {
        val spec = Catalogue.find(product["articleType"] as? String)
        val missing = mutableListOf<MissingField>()
        fun add(column: SpecColumn, label: String = column.label) { missing += MissingField(column.key, label, column.group) }

        val attrs = Values.map(product["attributes"])
        if (spec == null) {
            // No template: only the category's own required fields apply.
            for (column in extraColumns) if (column.required && !Values.present(attrs[column.key])) add(column)
            return missing
        }
        val angles = Values.map(product["imageAngles"])
        @Suppress("UNCHECKED_CAST")
        val variants = (product["variants"] as? List<Map<String, Any?>>) ?: emptyList()

        if (variants.isEmpty()) {
            val noun = if (spec.family == "apparel") "size" else spec.optionLabel.lowercase()
            missing += MissingField("sizes", "At least one $noun", "sizing")
        }
        // A draft may be saved without a selling price; nothing sells at ₹0.
        if (product.containsKey("pricePaise") && !((Values.number(product["pricePaise"]) ?: 0.0) > 0)) {
            missing += MissingField("price", "Selling price", "business")
        }

        for (column in requiredColumns(spec, extraColumns)) {
            when (column.scope) {
                "product" -> if (column.field != null && !Values.present(productValue(product, column.field))) add(column)
                "attribute" -> if (!Values.present(attrs[column.key])) add(column)
                "image" -> if (!Values.present(angles[column.key])) add(column)
                "variant" -> {
                    val field = column.field
                    if (variants.isEmpty() || field == null) continue
                    val lacking = variants.count { v ->
                        val value = v[field]
                        if (field == "sizeOnLabel") value == null else !Values.present(value)
                    }
                    if (lacking > 0) add(column, "${column.label} ($lacking size${if (lacking == 1) "" else "s"})")
                }
                "measurement" -> {
                    if (variants.isEmpty()) continue
                    val keys = listOf(column.key) + (column.anyOf ?: emptyList())
                    val lacking = variants.count { v ->
                        val m = Values.map(v["measurements"])
                        keys.none { Values.present(m[it]) }
                    }
                    if (lacking > 0) add(column, "${measurementLabel(spec, column)} ($lacking size${if (lacking == 1) "" else "s"})")
                }
            }
        }
        return missing
    }

    /** Throws [LiveCheckException] when a listing that is about to be ACTIVE is incomplete. */
    fun assertReadyToGoLive(product: Map<String, Any?>, extraColumns: List<SpecColumn> = emptyList()) {
        val missing = missingForLive(product, extraColumns)
        if (missing.isNotEmpty()) throw LiveCheckException(missing)
    }

    /**
     * Validate and normalise listing values, then refuse to make an incomplete
     * listing live. [existing] is the product as stored (with "variants"), or
     * null on create. When angles are sent, the gallery is rebuilt in angle
     * order and the front image becomes the thumbnail.
     */
    fun prepareListingWrite(
        data: MutableMap<String, Any?>,
        existing: Map<String, Any?>?,
        extraColumns: List<SpecColumn> = emptyList(),
    ): List<String> {
        val storedAttributes = existing?.get("attributes") as? Map<*, *>
        @Suppress("UNCHECKED_CAST")
        val errors = validateListingValues(data, existing?.get("articleType") as? String, extraColumns, storedAttributes as Map<String, Any?>?)
        if (errors.isNotEmpty()) return errors

        // A value for a category field the admin has since deleted is kept rather
        // than wiped by the next save. Template attributes are not.
        val attrs = data["attributes"]
        if (attrs is MutableMap<*, *> && storedAttributes != null) {
            @Suppress("UNCHECKED_CAST")
            val target = attrs as MutableMap<String, Any?>
            val shown = extraColumns.map { it.key }.toSet()
            for ((key, value) in storedAttributes) {
                val k = key.toString()
                if (k !in shown && k !in Catalogue.TEMPLATE_ATTRIBUTE_KEYS && k !in target) target[k] = value
            }
        }

        val angles = data["imageAngles"]
        if (angles is Map<*, *>) {
            val ordered = ANGLE_ORDER.mapNotNull { (angles[it] as? String)?.takeIf { url -> url.isNotEmpty() } }
            data["images"] = ordered
            data["thumbnail"] = (angles["front"] as? String) ?: ordered.firstOrNull()
        }

        val status = (data["status"] as? String) ?: (existing?.get("status") as? String)
        if (status == "ACTIVE") {
            val merged = LinkedHashMap<String, Any?>()
            existing?.let { merged.putAll(it) }
            merged.putAll(data)
            merged["variants"] = existing?.get("variants") ?: emptyList<Any>()
            assertReadyToGoLive(merged, extraColumns)
        }
        return emptyList()
    }
}
