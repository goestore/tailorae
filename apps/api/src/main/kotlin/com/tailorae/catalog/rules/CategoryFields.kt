package com.tailorae.catalog.rules

import java.text.Normalizer

enum class FieldType(val kind: String) {
    TEXT("text"),
    NUMBER("number"),
    SELECT("select"),
    MULTI_SELECT("multiselect"),
    BOOLEAN("boolean"),
}

data class FieldRow(
    val id: String,
    val categoryId: String,
    val key: String,
    val label: String,
    val type: FieldType = FieldType.TEXT,
    val options: List<String> = emptyList(),
    val unit: String? = null,
    val helpText: String? = null,
    val required: Boolean = false,
    val filterable: Boolean = false,
    val displayOrder: Int = 0,
)

/** A category with what this module needs of it. */
data class FieldCategory(
    val id: String,
    val name: String,
    val parentId: String?,
    val optionLabel: String? = null,
    val optionValues: List<String> = emptyList(),
    val fields: List<FieldRow> = emptyList(),
)

data class CategoryRef(val id: String, val name: String)

data class EffectiveField(
    val field: FieldRow,
    /** The category that defines it: this one, or an ancestor. */
    val definedBy: CategoryRef,
    val inherited: Boolean,
)

data class MergedOption(
    val optionLabel: String?,
    val optionValues: List<String>,
    val labelFrom: CategoryRef?,
    val valuesFrom: CategoryRef?,
)

/**
 * Product fields an admin adds to a category from the console (port of
 * legacy-api/src/utils/category-fields.ts). A field defined on Television
 * applies to every product filed under Television or below it, as attribute
 * columns of the same shape as a template's.
 */
object CategoryFields {
    val KEY_RE = Regex("^[a-z][a-zA-Z0-9]{0,59}$")

    private val fieldOrder: Comparator<FieldRow> =
        compareBy<FieldRow> { it.displayOrder }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.label }

    /** The category and its ancestors, root first. A missing parent or a loop ends the walk. */
    fun <T> ancestorChain(rows: List<T>, id: String?, idOf: (T) -> String, parentOf: (T) -> String?): List<T> {
        val byId = rows.associateBy(idOf)
        val chain = ArrayDeque<T>()
        val seen = mutableSetOf<String>()
        var current = id?.let { byId[it] }
        while (current != null && idOf(current) !in seen) {
            seen += idOf(current)
            chain.addFirst(current)
            current = parentOf(current)?.let { byId[it] }
        }
        return chain.toList()
    }

    fun ancestorChain(rows: List<FieldCategory>, id: String?): List<FieldCategory> =
        ancestorChain(rows, id, { it.id }, { it.parentId })

    /**
     * Fields of a root-first chain: ancestors' first, each category's in display
     * order. When two define one key the nearer category wins, in its own place.
     */
    fun mergeFields(chain: List<FieldCategory>): List<EffectiveField> {
        val self = chain.lastOrNull()?.id
        val byKey = LinkedHashMap<String, EffectiveField>()
        for (category in chain) {
            for (field in category.fields.sortedWith(fieldOrder)) {
                byKey.remove(field.key)
                byKey[field.key] = EffectiveField(field, CategoryRef(category.id, category.name), category.id != self)
            }
        }
        return byKey.values.toList()
    }

    /** The nearest variant option name and the nearest suggested values. */
    fun mergeOption(chain: List<FieldCategory>): MergedOption {
        val nearest = chain.reversed()
        val label = nearest.firstOrNull { !it.optionLabel.isNullOrBlank() }
        val values = nearest.firstOrNull { it.optionValues.isNotEmpty() }
        return MergedOption(
            optionLabel = label?.optionLabel?.trim(),
            optionValues = values?.optionValues ?: emptyList(),
            labelFrom = label?.let { CategoryRef(it.id, it.name) },
            valuesFrom = values?.let { CategoryRef(it.id, it.name) },
        )
    }

    /** A field as a listing-catalogue attribute column. */
    fun fieldColumn(field: EffectiveField): SpecColumn {
        val f = field.field
        return SpecColumn(
            key = f.key,
            header = f.label,
            label = f.label,
            group = "discoverability",
            required = f.required,
            kind = f.type.kind,
            scope = "attribute",
            filterable = f.filterable,
            values = when (f.type) {
                FieldType.SELECT, FieldType.MULTI_SELECT -> f.options
                FieldType.BOOLEAN -> listOf("Yes", "No")
                else -> null
            },
            unit = f.unit?.takeIf { it.isNotEmpty() },
            helpText = f.helpText?.takeIf { it.isNotEmpty() },
            sourceCategoryId = field.definedBy.id,
            sourceCategoryName = field.definedBy.name,
        )
    }

    /** Everything a product in this category gets on top of its template. */
    fun extrasFor(rows: List<FieldCategory>, categoryId: String?): CategoryExtras {
        val chain = ancestorChain(rows, categoryId)
        val option = mergeOption(chain)
        return CategoryExtras(mergeFields(chain).map(::fieldColumn), option.optionLabel, option.optionValues)
    }

    /**
     * The categories whose fields a product here could meet alongside this
     * one's: its ancestors and its descendants. A key must be unique across all.
     */
    fun <T> relatedCategoryIds(rows: List<T>, id: String, idOf: (T) -> String, parentOf: (T) -> String?): List<String> {
        val out = ancestorChain(rows, id, idOf, parentOf).map(idOf)
        val below = mutableListOf(id)
        var i = 0
        while (i < below.size) {
            for (row in rows) if (parentOf(row) == below[i] && idOf(row) !in below) below += idOf(row)
            i++
        }
        return (out + below).distinct()
    }

    /** "Screen size (inch)" → "screenSize". */
    fun camelKey(label: String): String {
        val words = Normalizer.normalize(label, Normalizer.Form.NFKD)
            .replace(Regex("\\(.*?\\)"), " ")
            .replace(Regex("[^A-Za-z0-9]+"), " ")
            .trim()
            .split(Regex("\\s+"))
            .filter { it.isNotEmpty() }
        val key = words.mapIndexed { i, w -> if (i == 0) w.lowercase() else w[0].uppercaseChar() + w.substring(1).lowercase() }.joinToString("")
        // A key must start with a letter: "4K support" → "field4kSupport".
        return if (Regex("^[a-z]").containsMatchIn(key)) key.take(60)
        else "field${key.take(1).uppercase()}${key.drop(1)}".take(60)
    }

    /** Trim, drop blanks and case-insensitive duplicates; a string may be comma-separated. */
    fun cleanOptions(value: Any?): List<String>? {
        val list: List<Any?> = when (value) {
            is String -> value.split(",")
            is List<*> -> value
            else -> return null
        }
        if (list.any { it !is String && it !is Number }) return null
        val out = mutableListOf<String>()
        for (raw in list) {
            val option = ProductSpec.text(raw).trim().replace(Regex("\\s+"), " ").take(80)
            if (option.isNotEmpty() && out.none { it.equals(option, ignoreCase = true) }) out += option
        }
        return out
    }

    private val TYPES = FieldType.entries.map { it.name }

    /**
     * Whitelist and check a field from the console. [current] is the stored
     * field on an update (only what was sent is checked, against the merged
     * result), or null on create, where the key comes from the label if not given.
     */
    fun pickFieldInput(body: Map<String, Any?>, current: Map<String, Any?>?): Picked {
        val out = Picked()
        val data = out.data
        val errors = out.errors
        fun sent(key: String) = body.containsKey(key)

        if (current == null || sent("label")) {
            val label = (body["label"] as? String)?.trim()?.replace(Regex("\\s+"), " ") ?: ""
            if (label.isEmpty() || label.length > 60) errors += "Name the field (at most 60 characters)" else data["label"] = label
        }
        if (current == null) {
            val given = (body["key"] as? String)?.trim()
            val key = if (!given.isNullOrEmpty()) given else camelKey((data["label"] as? String) ?: "")
            if (!KEY_RE.matches(key)) errors += "key must be camelCase letters and digits, starting with a letter" else data["key"] = key
        } else if (sent("key") && body["key"] != current["key"]) {
            // Renaming the key would orphan every value already saved under it.
            errors += "A field key cannot be changed once created; delete the field and add a new one"
        }
        if (current == null || sent("type")) {
            val type = body["type"] ?: "TEXT"
            if (type !is String || type !in TYPES) errors += "type must be one of ${TYPES.joinToString(", ")}" else data["type"] = type
        }
        if (current == null || sent("options")) {
            val options = if (body["options"] == null) emptyList() else cleanOptions(body["options"])
            when {
                options == null -> errors += "options must be a list of values"
                options.size > 100 -> errors += "A field can offer at most 100 options"
                else -> data["options"] = options
            }
        }
        for (field in listOf("unit", "helpText")) {
            if (!sent(field)) continue
            val value = body[field]
            when {
                value == null || value == "" -> data[field] = null
                value !is String -> errors += "$field must be text"
                else -> data[field] = value.trim().take(if (field == "unit") 20 else 200).ifEmpty { null }
            }
        }
        for (flag in listOf("required", "filterable")) {
            if (!sent(flag)) continue
            val value = body[flag]
            if (value !is Boolean) errors += "$flag must be true or false" else data[flag] = value
        }
        if (sent("displayOrder")) {
            val n = Values.number(body["displayOrder"])
            if (n == null || n % 1.0 != 0.0 || n < 0 || n > 10000) errors += "displayOrder must be a whole number" else data["displayOrder"] = n.toInt()
        }

        // The rules that depend on the type, checked on the merged result.
        val type = (data["type"] as? String) ?: (current?.get("type") as? String) ?: "TEXT"
        @Suppress("UNCHECKED_CAST")
        val options = (data["options"] as? List<String>) ?: (current?.get("options") as? List<String>) ?: emptyList()
        val isList = type == "SELECT" || type == "MULTI_SELECT"
        if (isList && options.isEmpty()) errors += "A list field needs at least one option"
        // Options mean nothing to a number, text or yes/no field.
        if (!isList && options.isNotEmpty()) data["options"] = emptyList<String>()
        val unit = if (data.containsKey("unit")) data["unit"] else current?.get("unit")
        if (type != "NUMBER" && unit != null && unit != "") data["unit"] = null
        return out
    }
}
