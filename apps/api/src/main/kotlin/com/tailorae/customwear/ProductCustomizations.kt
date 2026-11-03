package com.tailorae.customwear

import tools.jackson.databind.JsonNode

/** One personalisation option on a catalogue product (row of `product_customization`, V3). */
data class CustomizationOption(
    val name: String,
    /** `TEXT`, `COLOR`, `IMAGE` or `EMBROIDERY`, as the V3 check constraint spells them. */
    val type: String,
    val isRequired: Boolean,
    /** The choices a shopper picks from; null when there is nothing to choose. */
    val options: List<String>?,
    val additionalPaise: Long,
    val maxCharacters: Int?,
)

/**
 * Personalisation rules for regular catalogue products, ported from legacy-api
 * `utils/customizations.ts`. Pure: the endpoints that store them
 * (`PUT /products/{id}/customizations`) write the catalog module's tables and
 * belong to it; it can call these.
 */
object ProductCustomizations {
    private val TYPES = setOf("text", "color", "image", "embroidery")

    /** What a product gets when personalisation is first switched on: free by default. */
    val DEFAULT_OPTIONS = listOf(
        CustomizationOption("Text to print", "TEXT", false, null, 0, 30),
        CustomizationOption("Embroidery text", "EMBROIDERY", false, null, 0, 20),
    )

    /** Validates the option list the customization editor sends (`additionalPaise`, not legacy rupees). */
    fun parseRows(raw: JsonNode?): Pair<List<CustomizationOption>, List<String>> {
        if (raw == null || !raw.isArray) return emptyList<CustomizationOption>() to listOf("customizations must be an array")
        val errors = mutableListOf<String>()
        val rows = (0 until raw.size()).map { index ->
            val row = raw.get(index)
            val label = "Option ${index + 1}"
            val name = row.get("name")?.takeIf { it.isString }?.asString()?.trim()?.takeIf { it.isNotEmpty() }
            if (name == null) errors += "$label: a name is required"
            val type = row.get("type")?.takeIf { it.isString }?.asString()?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: "text"
            if (type !in TYPES) errors += "$label: type must be text, color, image or embroidery"
            val cost = row.get("additionalPaise")
            val additional = when {
                cost == null || cost.isNull -> 0L
                cost.isIntegralNumber && cost.asLong() >= 0 -> cost.asLong()
                else -> { errors += "$label: extra cost must be zero or more"; 0L }
            }
            val max = row.get("maxCharacters")
            val maxCharacters = when {
                max == null || max.isNull || (max.isString && max.asString().isEmpty()) -> null
                max.isIntegralNumber && max.asLong() in 1..Int.MAX_VALUE -> max.asInt()
                else -> { errors += "$label: character limit must be a whole number above zero"; null }
            }
            // An empty list is "nothing to choose from", which the column says as null.
            val options = row.get("options")?.let { o ->
                when {
                    o.isArray -> (0 until o.size()).map { o.get(it) }.filter { it.isString && it.asString().isNotBlank() }.map { it.asString() }.ifEmpty { null }
                    o.isString && o.asString().isNotBlank() -> listOf(o.asString())
                    else -> null
                }
            }
            CustomizationOption(
                name = name?.take(120) ?: "",
                type = type.uppercase(),
                isRequired = row.get("isRequired")?.let { it.isBoolean && it.asBoolean() } ?: false,
                options = options,
                additionalPaise = additional,
                maxCharacters = maxCharacters,
            )
        }
        return rows to errors
    }
}
