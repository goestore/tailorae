package com.tailorae.content

import com.tailorae.common.BadRequestException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.NullNode

/** One value an admin wants drafted. [value] is never Java null: a JSON null is [NullNode]. */
data class ContentEntry(val path: String, val value: JsonNode, val isPrivate: Boolean)

/**
 * Shape rules for content writes, ported from legacy-api `routes/content.ts`.
 *
 * Shape checks only — NOT an allowlist. The authoritative list of editable
 * paths is the web registry (`web/src/content/define.ts`); the storefront's
 * `resolveContent` drops any stored path it does not declare, so an unknown
 * path is inert rather than rendered.
 */
object ContentRules {
    /** Drafts live at a reserved version below every published one. */
    const val DRAFT_VERSION = 0
    const val MAX_VALUES_PER_WRITE = 200
    const val MAX_VALUE_BYTES = 20_000

    val PATH = Regex("^(/[A-Za-z0-9_-]+){1,8}$")
    val NAMESPACE = Regex("^[a-z0-9][a-z0-9-]{0,63}$")

    fun requireNamespace(raw: String): String {
        if (!NAMESPACE.matches(raw)) throw BadRequestException("namespace must be a lowercase slug, e.g. \"brand\" or \"custom-wear\"")
        return raw
    }

    /** Validates a `{ values: [{ path, value, isPrivate? }] }` body. Errors are user-facing. */
    fun pickValues(body: JsonNode?, json: JsonMapper): Pair<List<ContentEntry>, List<String>> {
        val entries = mutableListOf<ContentEntry>()
        val errors = mutableListOf<String>()
        val values = body?.get("values")
        if (values == null || !values.isArray) return entries to listOf("values must be an array of { path, value }")
        if (values.size() == 0) errors += "values must contain at least one entry"
        if (values.size() > MAX_VALUES_PER_WRITE) errors += "values must contain at most $MAX_VALUES_PER_WRITE entries"

        (0 until minOf(values.size(), MAX_VALUES_PER_WRITE)).forEach { index ->
            val raw = values.get(index)
            if (!raw.isObject) {
                errors += "values[$index] must be an object"
                return@forEach
            }
            val path = raw.get("path")
            if (path == null || !path.isString || !PATH.matches(path.asString())) {
                errors += "values[$index].path must be a JSON pointer, e.g. /hero/heading"
                return@forEach
            }
            // A missing key is not a null value: silently writing null would blank the field.
            if (!raw.has("value")) {
                errors += "values[$index].value is required (use null to store an empty value)"
                return@forEach
            }
            val value = raw.get("value") ?: NullNode.instance
            if (json.writeValueAsString(value).length > MAX_VALUE_BYTES) {
                errors += "values[$index].value exceeds $MAX_VALUE_BYTES bytes"
                return@forEach
            }
            // Anything not explicitly true is public: a malformed flag fails to the
            // publishable reading rather than silently hiding real content.
            val isPrivate = raw.get("isPrivate")?.let { it.isBoolean && it.asBoolean() } ?: false
            entries += ContentEntry(path.asString(), value, isPrivate)
        }
        return entries to errors
    }

    /**
     * The current value of each path. Publishing never rewrites older rows, so a
     * namespace holds every version a path ever had; the highest wins.
     */
    fun <T> latestPerPath(rows: List<T>, path: (T) -> String, version: (T) -> Int): List<T> =
        rows.groupBy(path).values.map { versions -> versions.maxBy(version) }.sortedBy(path)
}
