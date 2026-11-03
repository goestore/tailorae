package com.tailorae.catalog.rules

/**
 * A whitelisted, checked request body: the fields that may be written, and
 * everything wrong with what was sent. Only keys present in [data] were sent.
 */
data class Picked(
    val data: MutableMap<String, Any?> = linkedMapOf(),
    val errors: MutableList<String> = mutableListOf(),
)

/** Helpers shared by the rules for reading loosely typed JSON-ish maps. */
internal object Values {
    fun str(value: Any?): String? = value as? String

    fun isBlank(value: Any?): Boolean = value == null || (value is String && value.isEmpty())

    /** A number from a Number or a numeric string; null when it is neither. */
    fun number(value: Any?): Double? = when (value) {
        null -> null
        is Number -> value.toDouble()
        is Boolean -> null
        is String -> value.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()
        else -> null
    }

    @Suppress("UNCHECKED_CAST")
    fun map(value: Any?): Map<String, Any?> = (value as? Map<String, Any?>) ?: emptyMap()

    fun list(value: Any?): List<Any?> = (value as? List<Any?>) ?: emptyList()

    /** JavaScript-style truthiness of a stored value, for "is it present". */
    fun present(value: Any?): Boolean = when (value) {
        null -> false
        is String -> value.trim().isNotEmpty()
        is Number -> value.toDouble().isFinite()
        is Collection<*> -> value.isNotEmpty()
        else -> true
    }

    /** Equality as JSON would see it: 12 and 12.0 are the same number. */
    fun jsonEquals(a: Any?, b: Any?): Boolean = normalise(a) == normalise(b)

    private fun normalise(value: Any?): Any? = when (value) {
        is Number -> value.toDouble()
        is Map<*, *> -> value.entries.associate { it.key.toString() to normalise(it.value) }
        is Collection<*> -> value.map { normalise(it) }
        else -> value
    }
}
