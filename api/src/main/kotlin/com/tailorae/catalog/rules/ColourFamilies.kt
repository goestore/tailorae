package com.tailorae.catalog.rules

/**
 * Colour families: the one fixed list every filter uses.
 *
 * A seller's colour name is free text ("Dusty Rose", "navy", "Nevy Blue",
 * "Black & Purple"). Filtering on that splits one colour into many chips and
 * misses typos. Instead each colour is also filed under a family from this
 * list — Myntra's own "prominent colour" values, so a listing exports cleanly —
 * and the storefront filters on the family only. The name stays for display.
 */
data class ColourFamily(val name: String, val slug: String, val hex: String)

object ColourFamilies {
    private val FAMILY_HEX = listOf(
        "Black" to "#1A1A1A", "White" to "#F8F8F8", "Off White" to "#F2EEE3", "Cream" to "#F3E5C0",
        "Beige" to "#D9C4A3", "Nude" to "#E3BC9A", "Grey" to "#8C8C8C", "Grey Melange" to "#A9A9A9",
        "Charcoal" to "#3E4144", "Silver" to "#C0C0C0", "Steel" to "#71797E", "Navy Blue" to "#1F2A44",
        "Blue" to "#2F5DA8", "Turquoise Blue" to "#2BB3C0", "Teal" to "#1F7A7A", "Sea Green" to "#2E8B57",
        "Green" to "#2E7D4F", "Lime Green" to "#7CC242", "Fluorescent Green" to "#39FF14", "Olive" to "#6B6B2E",
        "Khaki" to "#B5A36A", "Yellow" to "#E9B600", "Mustard" to "#C99A2E", "Gold" to "#C9A227",
        "Champagne" to "#E8D3A9", "Orange" to "#E0702B", "Coral" to "#F27A6B", "Peach" to "#F6B89A",
        "Rust" to "#B7472A", "Copper" to "#B8733B", "Bronze" to "#8C6A3C", "Red" to "#C62828",
        "Maroon" to "#6D1B2A", "Burgundy" to "#7A1F3D", "Pink" to "#F28AB2", "Rose" to "#E07A93",
        "Rose Gold" to "#C9897B", "Fuchsia" to "#D6337F", "Magenta" to "#C2185B", "Mauve" to "#B784A7",
        "Lavender" to "#B9A6DE", "Violet" to "#7F4FC9", "Purple" to "#6A3D9A", "Brown" to "#7B4A2A",
        "Coffee Brown" to "#5B3A29", "Camel Brown" to "#B5875A", "Tan" to "#C19A6B", "Taupe" to "#8B7D6B",
        "Metallic" to "#A8A9AD", "Transparent" to "#EDEDED", "Multi" to "#9E9E9E",
    )

    private fun slugify(value: String): String =
        value.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')

    val ALL: List<ColourFamily> = FAMILY_HEX.map { (name, hex) -> ColourFamily(name, slugify(name), hex) }

    /** Loose key: case, spaces, punctuation and "colour/color" suffixes ignored. */
    internal fun norm(value: String): String =
        value.lowercase().replace(Regex("colou?r(ed)?"), "").replace(Regex("[^a-z]"), "")

    private val BY_KEY: Map<String, ColourFamily> = buildMap {
        for (family in ALL) {
            put(norm(family.name), family)
            put(family.slug, family)
        }
    }

    /** Everyday and Indian trade names for the families, matched on the loose key. */
    private val ALIASES: Map<String, String> = mapOf(
        "navy" to "Navy Blue", "nevy" to "Navy Blue", "navyblue" to "Navy Blue", "midnight" to "Navy Blue", "ink" to "Navy Blue",
        "sky" to "Blue", "skyblue" to "Blue", "royal" to "Blue", "royalblue" to "Blue", "denim" to "Blue", "indigo" to "Blue",
        "cobalt" to "Blue", "powderblue" to "Blue", "babyblue" to "Blue", "lightblue" to "Blue", "darkblue" to "Navy Blue",
        "aqua" to "Turquoise Blue", "turquoise" to "Turquoise Blue", "cyan" to "Turquoise Blue", "ferozi" to "Turquoise Blue",
        "peacock" to "Teal", "petrol" to "Teal",
        "mint" to "Sea Green", "seagreen" to "Sea Green", "emerald" to "Green", "bottlegreen" to "Green", "forest" to "Green",
        "parrot" to "Lime Green", "parrotgreen" to "Lime Green", "lime" to "Lime Green", "neon" to "Fluorescent Green", "neongreen" to "Fluorescent Green",
        "mehendi" to "Olive", "mehndi" to "Olive", "armygreen" to "Olive", "military" to "Olive",
        "ivory" to "Off White", "offwhite" to "Off White", "ecru" to "Off White", "pearl" to "Off White",
        "milk" to "White", "snow" to "White",
        "sand" to "Beige", "fawn" to "Beige", "skin" to "Nude",
        "ash" to "Grey", "gray" to "Grey", "lightgrey" to "Grey", "greymelange" to "Grey Melange", "melange" to "Grey Melange",
        "slate" to "Charcoal", "darkgrey" to "Charcoal", "jetblack" to "Black", "onyx" to "Black",
        "lemon" to "Yellow", "haldi" to "Mustard", "ochre" to "Mustard",
        "saffron" to "Orange", "tangerine" to "Orange", "kesari" to "Orange",
        "salmon" to "Coral", "apricot" to "Peach",
        "wine" to "Burgundy", "plum" to "Burgundy", "oxblood" to "Burgundy", "crimson" to "Red", "scarlet" to "Red", "cherry" to "Red", "brick" to "Rust",
        "rani" to "Magenta", "ranipink" to "Magenta", "hotpink" to "Fuchsia", "babypink" to "Pink", "blush" to "Pink", "dustyrose" to "Rose",
        "onion" to "Mauve", "onionpink" to "Mauve", "lilac" to "Lavender", "orchid" to "Violet", "jamun" to "Purple", "grape" to "Purple", "aubergine" to "Purple",
        "chocolate" to "Coffee Brown", "coffee" to "Coffee Brown", "mocha" to "Coffee Brown", "walnut" to "Brown", "camel" to "Camel Brown", "caramel" to "Camel Brown",
        "golden" to "Gold", "silvery" to "Silver",
        "multi" to "Multi", "multicolor" to "Multi", "multicolour" to "Multi", "assorted" to "Multi", "printed" to "Multi", "rainbow" to "Multi",
    )
    private val ALIAS_KEY: Map<String, String> = ALIASES.entries.associate { norm(it.key) to it.value }

    fun byName(name: String?): ColourFamily? {
        if (name.isNullOrEmpty()) return null
        return BY_KEY[norm(name)] ?: BY_KEY[slugify(name)]
    }

    /** The family a stored value means, tolerating case, spacing and the aliases. */
    fun canonical(value: String?): ColourFamily? {
        if (value.isNullOrEmpty()) return null
        byName(value)?.let { return it }
        return ALIAS_KEY[norm(value)]?.let { byName(it) }
    }

    /** One-character edits apart: catches "Mroon", "Purpel", "Beig". */
    private fun closeEnough(a: String, b: String): Boolean {
        if (Math.abs(a.length - b.length) > 1 || minOf(a.length, b.length) < 3 || maxOf(a.length, b.length) < 4) return false
        var i = 0
        var j = 0
        var edits = 0
        while (i < a.length && j < b.length) {
            if (a[i] == b[j]) {
                i++; j++; continue
            }
            if (++edits > 1) return false
            when {
                a.length > b.length -> i++
                b.length > a.length -> j++
                i + 1 < a.length && j + 1 < b.length && a[i + 1] == b[j] && a[i] == b[j + 1] -> { i += 2; j += 2 }
                else -> { i++; j++ }
            }
        }
        return edits + (a.length - i) + (b.length - j) <= 1
    }

    private fun hexToRgb(hex: String): IntArray? {
        val m = Regex("^#?([0-9a-fA-F]{6})$").find(hex.trim()) ?: return null
        val n = m.groupValues[1].toInt(16)
        return intArrayOf((n shr 16) and 255, (n shr 8) and 255, n and 255)
    }

    /**
     * Best family for a seller's colour name, and their chosen swatch if any.
     * Order: the whole name, then each word from the last, allowing one typo;
     * two or more distinct families in the name make it Multi; failing all
     * that, the family nearest the swatch. Null when nothing is a reasonable guess.
     */
    fun suggest(name: String?, hex: String? = null): ColourFamily? {
        canonical(name ?: "")?.let { return it }

        val words = (name ?: "").split(Regex("[^a-zA-Z]+")).map { it.trim() }.filter { it.isNotEmpty() }
        val found = mutableListOf<ColourFamily>()
        // Two-word families first ("Navy Blue" inside "Dark Navy Blue Check").
        for (i in 0 until words.size - 1) {
            val pair = canonical("${words[i]} ${words[i + 1]}")
            if (pair != null && pair !in found) found += pair
        }
        for (word in words.reversed()) {
            var family = canonical(word)
            if (family == null) {
                val key = norm(word)
                family = ALL.firstOrNull { closeEnough(key, norm(it.name)) }
                    ?: ALIAS_KEY.entries.firstOrNull { closeEnough(key, it.key) }?.let { byName(it.value) }
            }
            if (family != null && found.none { it.slug == family.slug }) found += family
        }
        // "Navy Blue" also contains "Blue": a family wholly inside a longer one is not a second colour.
        val distinct = found.filter { f -> found.none { g -> g !== f && norm(g.name).contains(norm(f.name)) } }
        if (distinct.size == 1) return distinct[0]
        if (distinct.size > 1) return byName("Multi")

        val rgb = hex?.let { hexToRgb(it) } ?: return null
        var best: ColourFamily? = null
        var bestDistance = Double.POSITIVE_INFINITY
        for (family in ALL) {
            if (family.name == "Multi" || family.name == "Transparent" || family.name == "Metallic") continue
            val (r, g, b) = hexToRgb(family.hex)!!.let { Triple(it[0], it[1], it[2]) }
            val d = 2.0 * (r - rgb[0]) * (r - rgb[0]) + 4.0 * (g - rgb[1]) * (g - rgb[1]) + 3.0 * (b - rgb[2]) * (b - rgb[2])
            if (d < bestDistance) {
                bestDistance = d
                best = family
            }
        }
        return best
    }
}

/**
 * Fills in `colorFamily` on a product or variant write, in place.
 *
 * - A family the caller sent is normalised to the list's spelling; one that is
 *   not on the list is replaced by a suggestion (variants) or cleared (products).
 * - A write that changes the colour but sends no family gets one suggested
 *   from the colour name (and, for a product, its prominent colour first).
 */
object ColourFamilySync {
    fun variant(data: MutableMap<String, Any?>) {
        val sent = data["colorFamily"] as? String
        if (sent != null) {
            data["colorFamily"] = ColourFamilies.canonical(sent)?.name ?: ColourFamilies.suggest(data["color"] as? String)?.name
            return
        }
        if ("color" in data) {
            val colour = data["color"] as? String
            data["colorFamily"] = if (!colour.isNullOrEmpty()) ColourFamilies.suggest(colour)?.name else null
        }
    }

    fun product(data: MutableMap<String, Any?>) {
        val sent = data["colorFamily"] as? String
        if (sent != null) {
            data["colorFamily"] = ColourFamilies.canonical(sent)?.name
            return
        }
        if ("primaryColour" !in data && "brandColour" !in data && "color" !in data) return
        val prominent = data["primaryColour"] as? String
        val brandColour = data["brandColour"] as? String
        val named = if (!brandColour.isNullOrEmpty()) brandColour else data["color"] as? String
        val family = ColourFamilies.canonical(prominent) ?: ColourFamilies.suggest(named)
        // A partial update that only touched one of these leaves an existing family
        // alone unless it can say something better.
        if (family != null) data["colorFamily"] = family.name
        else if (prominent != null || named != null) data["colorFamily"] = null
    }
}
