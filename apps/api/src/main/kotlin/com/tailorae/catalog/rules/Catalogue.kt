package com.tailorae.catalog.rules

import tools.jackson.databind.json.JsonMapper

/**
 * One column of a listing template: where a value lives (`scope`, `field`),
 * whether it is mandatory, and the dropdown it must come from.
 */
data class SpecColumn(
    val key: String,
    val header: String,
    val label: String,
    /** business | discoverability | sizing | imagery */
    val group: String,
    val required: Boolean,
    val kind: String,
    /** product | variant | attribute | measurement | image | ignore */
    val scope: String,
    val field: String? = null,
    /** Name of a catalogue list holding the dropdown values. */
    val options: String? = null,
    /** Other measurement keys that satisfy this one (bust or chest). */
    val anyOf: List<String>? = null,
    /** An attribute shoppers can filter the storefront by. */
    val filterable: Boolean = false,
    /** Inline dropdown values (a field an admin added to a category). */
    val values: List<String>? = null,
    /** Shown after a number: "inch", "Hz". */
    val unit: String? = null,
    val helpText: String? = null,
    /** The category that defines this column, when it is not the template's. */
    val sourceCategoryId: String? = null,
    val sourceCategoryName: String? = null,
)

/**
 * A listing template. `apparel` templates carry a size chart, measurements and
 * a look shot; `general` ones name their one variant option themselves.
 */
data class ArticleTypeSpec(
    val articleType: String,
    val slug: String,
    val template: String?,
    val sourceFile: String?,
    /** apparel | general */
    val family: String,
    /** What the variant `size` column holds, as shoppers read it. */
    val optionLabel: String,
    /** Name of the list of sizes, when the option is a fixed size chart. */
    val sizes: String?,
    val columns: List<SpecColumn>,
)

/**
 * What a product's category adds on top of its template: the admin-defined
 * fields of the category and its ancestors, and the variant option name and
 * suggested values.
 */
data class CategoryExtras(
    val columns: List<SpecColumn> = emptyList(),
    val optionLabel: String? = null,
    val optionValues: List<String> = emptyList(),
) {
    companion object {
        val EMPTY = CategoryExtras()
    }
}

/**
 * The merged listing catalogue: Myntra's apparel templates (generated from
 * their SKU sheets) and our hand-written general templates, read once from
 * `classpath:catalog/`. The form, the validator and the Myntra export all read
 * this, so they can never disagree about what a Dress needs.
 */
object Catalogue {
    private class Loaded(val articleTypes: List<ArticleTypeSpec>, val lists: Map<String, List<String>>)

    /**
     * Where Myntra's yellow cells overstate what a listing needs: bust and chest
     * are both marked mandatory, but a seller fills one.
     */
    private val EITHER_OR_MEASUREMENTS = listOf(listOf("bustIn", "chestIn"), listOf("toFitBustIn", "toFitChestIn"))

    /** Marked mandatory, but small brands often have no barcodes. Still validated when given. */
    private val OPTIONAL_TO_GO_LIVE = setOf("gtin")

    /** Product money columns are paise in our data maps. */
    private val FIELD_RENAMES = mapOf("price" to "pricePaise", "originalPrice" to "mrpPaise")

    private val loaded: Loaded by lazy { load() }

    val articleTypes: List<ArticleTypeSpec> get() = loaded.articleTypes
    val lists: Map<String, List<String>> get() = loaded.lists

    /** Every size the templates know, in size-chart order. */
    val SIZE_ORDER: List<String> by lazy {
        articleTypes.flatMap { t -> t.sizes?.let { lists[it] } ?: emptyList() }.distinct()
    }

    /** Every attribute key some template defines (versus one an admin added). */
    val TEMPLATE_ATTRIBUTE_KEYS: Set<String> by lazy {
        articleTypes.flatMap { t -> t.columns.filter { it.scope == "attribute" }.map { it.key } }.toSet()
    }

    fun find(nameOrSlug: String?): ArticleTypeSpec? {
        if (nameOrSlug.isNullOrEmpty()) return null
        val needle = nameOrSlug.trim().lowercase()
        return articleTypes.firstOrNull { it.articleType.lowercase() == needle || it.slug == needle }
    }

    fun optionsFor(c: SpecColumn): List<String> = c.values ?: c.options?.let { lists[it] } ?: emptyList()

    @Suppress("UNCHECKED_CAST")
    private fun load(): Loaded {
        val mapper = JsonMapper.builder().build()
        fun read(name: String): Map<String, Any?> {
            val stream = Catalogue::class.java.classLoader.getResourceAsStream("catalog/$name")
                ?: error("catalog/$name is missing from the classpath")
            return stream.use { mapper.readValue(it, Map::class.java) as Map<String, Any?> }
        }
        val myntra = read("myntra-catalogue.json")
        val general = read("general-catalogue.json")
        val myntraLists = (myntra["lists"] as Map<String, List<String>>)
        val generalLists = (general["lists"] as Map<String, List<String>>)
        val myntraTypes = (myntra["articleTypes"] as List<Map<String, Any?>>)
        val generalTypes = (general["articleTypes"] as List<Map<String, Any?>>)

        // The general templates borrow the country, colour and age-group dropdowns
        // from Myntra's rather than copying them.
        fun borrowed(key: String): List<String> {
            val first = (myntraTypes.firstOrNull()?.get("columns") as? List<Map<String, Any?>>) ?: emptyList()
            val optionsKey = first.firstOrNull { it["key"] == key }?.get("options") as? String
            return optionsKey?.let { myntraLists[it] } ?: emptyList()
        }

        val lists = LinkedHashMap<String, List<String>>()
        lists.putAll(myntraLists)
        lists["countries"] = borrowed("countryOfOrigin")
        lists["colours"] = borrowed("prominentColour")
        lists["ageGroups"] = borrowed("ageGroup")
        lists.putAll(generalLists)

        fun column(raw: Map<String, Any?>): SpecColumn {
            val field = raw["field"] as? String
            return SpecColumn(
                key = raw["key"] as String,
                header = raw["header"] as String,
                label = raw["label"] as String,
                group = raw["group"] as String,
                required = raw["required"] == true,
                kind = raw["kind"] as String,
                scope = raw["scope"] as String,
                field = field?.let { FIELD_RENAMES[it] ?: it },
                options = raw["options"] as? String,
                filterable = raw["filterable"] == true,
                values = (raw["values"] as? List<*>)?.map { it.toString() },
                unit = raw["unit"] as? String,
                helpText = raw["helpText"] as? String,
            )
        }

        fun type(raw: Map<String, Any?>, apparel: Boolean): ArticleTypeSpec {
            val columns = (raw["columns"] as List<Map<String, Any?>>).map(::column)
            val tuned = columns.map { c ->
                var out = c
                if (c.key in OPTIONAL_TO_GO_LIVE) out = out.copy(required = false)
                if (c.scope == "measurement") {
                    val pair = EITHER_OR_MEASUREMENTS.firstOrNull { c.key in it }
                    val others = pair?.filter { k -> k != c.key && columns.any { it.key == k && it.scope == "measurement" } }
                    if (!others.isNullOrEmpty()) out = out.copy(anyOf = others)
                }
                out
            }
            return ArticleTypeSpec(
                articleType = raw["articleType"] as String,
                slug = raw["slug"] as String,
                template = (raw["template"] as? String)?.takeIf { it.isNotEmpty() },
                sourceFile = raw["sourceFile"] as? String,
                family = if (apparel) "apparel" else (raw["family"] as? String ?: "general"),
                optionLabel = if (apparel) "Size" else (raw["optionLabel"] as? String ?: "Size"),
                sizes = (raw["sizes"] as? String)?.takeIf { it.isNotEmpty() },
                columns = tuned,
            )
        }

        val types = myntraTypes.map { type(it, apparel = true) } + generalTypes.map { type(it, apparel = false) }
        return Loaded(types, lists)
    }
}
