package com.tailorae.customwear

import tools.jackson.databind.JsonNode
import java.security.SecureRandom
import java.time.Year
import kotlin.math.roundToLong

data class QuoteContact(
    val customerName: String,
    val company: String?,
    val email: String,
    val phone: String?,
    val country: String,
    val postcode: String?,
    val requiredBy: String?,
)

/** One garment line as the customer sent it (product fields are re-read from the catalogue). */
data class QuoteItem(
    val productId: String,
    val colorName: String?,
    val sizes: List<String>,
    val quantity: Int,
    val method: String?,
    val locations: List<String>,
    val designFiles: List<String>,
    val notes: String?,
)

/**
 * Quote request validation, ported from legacy-api `utils/custom-wear.ts`.
 * The request comes from a public form, so every field is checked by hand and
 * every message is something the customer can act on.
 */
object QuoteRules {
    val STATUSES = listOf("NEW", "CONTACTED", "QUOTED", "WON", "LOST")
    val REFERENCE = Regex("^CWQ-\\d{4}-\\d{6}$")
    private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    /** Artwork references this API issued ([ArtworkStore]). Anything else in a quote is refused. */
    val ARTWORK_REFERENCE = Regex("^artwork/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp|pdf)$")

    const val MAX_QUANTITY = 1_000_000
    const val MAX_BATCH = 20

    private val random = SecureRandom()

    fun isValidEmail(value: String) = EMAIL.matches(value)

    fun newReference(year: Int = Year.now().value): String = "CWQ-$year-%06d".format(random.nextInt(1_000_000))

    fun parseContact(body: JsonNode, errors: MutableList<String>): QuoteContact {
        val customerName = str(body, "customerName", 120, true, errors)
        val email = str(body, "email", 254, true, errors)
        if (email != null && !isValidEmail(email)) errors += "email is not a valid address"
        val phone = str(body, "phone", 32, false, errors)
        val country = str(body, "country", 80, true, errors)
        return QuoteContact(
            customerName = customerName ?: "",
            company = str(body, "company", 160, false, errors),
            email = (email ?: "").lowercase(),
            phone = phone,
            country = country ?: "",
            postcode = str(body, "postcode", 20, false, errors),
            requiredBy = str(body, "requiredBy", 40, false, errors),
        )
    }

    /**
     * One garment line. Accepts explicit `method` / `locations`, or the
     * storefront's `placements` list (what goes where, and how), from which both
     * are derived and a readable summary is appended to the notes for the print team.
     */
    fun parseItem(body: JsonNode, errors: MutableList<String>): QuoteItem {
        val productId = str(body, "productId", 80, true, errors)
        val colorName = str(body, "colorName", 80, false, errors)
        val sizes = strList(body, "sizes", 20, 20, errors)

        val q = body.get("quantity")
        val quantity = if (q != null && q.isNumber && isWhole(q) && q.asLong() in 1..MAX_QUANTITY.toLong()) q.asInt() else {
            errors += "quantity must be a whole number between 1 and 1,000,000"
            0
        }

        var method = str(body, "method", 120, false, errors)
        var locations = strList(body, "locations", 8, 40, errors)
        var summary = emptyList<String>()
        val rawPlacements = body.get("placements")
        if (rawPlacements != null && !rawPlacements.isNull) {
            if (!rawPlacements.isArray || rawPlacements.size() > 8) {
                errors += "placements must be a list of at most 8 entries"
            } else {
                val placements = (0 until rawPlacements.size()).map { rawPlacements.get(it) }.filter { it.isObject }
                if (locations.isEmpty()) {
                    locations = placements.mapNotNull { it.textOrNull("location") }.distinct().map { it.take(40) }
                }
                if (method == null) {
                    val methods = placements.mapNotNull { it.textOrNull("method") }.distinct()
                    method = if (methods.isNotEmpty()) methods.joinToString(", ").take(120) else null
                }
                summary = placements.mapNotNull(::placementLine)
            }
        }

        val designFiles = strList(body, "designFiles", 10, 200, errors)
        if (designFiles.any { !ARTWORK_REFERENCE.matches(it) }) {
            errors += "designFiles must be artwork uploaded through /api/custom-wear/artwork"
        }

        val notes = str(body, "notes", 4000, false, errors)
        val combined = listOfNotNull(
            notes,
            if (summary.isNotEmpty()) "Placements:\n" + summary.joinToString("\n") { "- $it" } else null,
        ).joinToString("\n\n")

        return QuoteItem(productId ?: "", colorName, sizes, quantity, method, locations, designFiles, combined.ifEmpty { null })
    }

    /** `left-chest · embroidery · template crest-01 · file logo.png · 40% width` */
    fun placementLine(p: JsonNode): String? {
        val location = p.textOrNull("location")?.take(40) ?: return null
        val parts = mutableListOf(location)
        p.textOrNull("method")?.let { parts += it.take(40) }
        p.textOrNull("templateId")?.let { parts += "template ${it.take(60)}" }
        p.textOrNull("designFileName")?.let { parts += "file ${it.take(120)}" }
        p.get("widthPercent")?.takeIf { it.isNumber && it.asDouble().isFinite() }?.let { parts += "${jsRound(it.asDouble())}% width" }
        return parts.joinToString(" · ")
    }

    // ---------------------------------------------------------------- field readers

    private fun str(body: JsonNode, key: String, max: Int, required: Boolean, errors: MutableList<String>): String? {
        val raw = body.get(key)
        if (raw == null || raw.isNull || (raw.isString && raw.asString().isBlank())) {
            if (required) errors += "$key is required"
            return null
        }
        if (!raw.isString) {
            errors += "$key must be text"
            return null
        }
        val value = raw.asString().trim()
        if (value.length > max) {
            errors += "$key must be at most $max characters"
            return null
        }
        return value
    }

    private fun strList(body: JsonNode, key: String, maxItems: Int, maxLen: Int, errors: MutableList<String>): List<String> {
        val raw = body.get(key)
        if (raw == null || raw.isNull) return emptyList()
        if (!raw.isArray || raw.size() > maxItems) {
            errors += "$key must be a list of at most $maxItems entries"
            return emptyList()
        }
        val out = mutableListOf<String>()
        for (i in 0 until raw.size()) {
            val entry = raw.get(i)
            if (!entry.isString || entry.asString().isBlank() || entry.asString().length > maxLen) {
                errors += "$key contains an invalid entry"
                return emptyList()
            }
            out += entry.asString().trim()
        }
        return out.distinct()
    }

    private fun JsonNode.textOrNull(field: String): String? = get(field)?.takeIf { it.isString }?.asString()

    private fun isWhole(n: JsonNode) = n.isIntegralNumber || (n.asDouble() % 1.0 == 0.0)

    /** JavaScript's Math.round: halves round up (towards +∞). */
    private fun jsRound(x: Double): Long = Math.floor(x + 0.5).roundToLong()
}
