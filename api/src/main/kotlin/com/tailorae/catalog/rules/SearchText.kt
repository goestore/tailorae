package com.tailorae.catalog.rules

/**
 * Turning a shopper's query into the words that have to be matched (port of
 * `searchTokens` / `singular` in legacy-api/src/routes/products.ts).
 *
 * Matching word by word is what makes "black polo" find a polo whose colour is
 * black, which no whole-string match could.
 */
object SearchText {
    /**
     * Words carried by nearly every garment description. Dropped only when
     * something else survives — "the" on its own still searches literally.
     */
    val STOPWORDS = setOf("a", "an", "and", "for", "in", "of", "the", "to", "with")

    /** Longest query we tokenise. Past this it is not a search, it is a paste. */
    const val MAX_TOKENS = 6

    private val EDGE = Regex("^[^\\p{L}\\p{N}]+|[^\\p{L}\\p{N}]+$")

    /**
     * "girls dress" found nothing for "Baby Girl … Dress": the singular finds
     * both forms while the plural finds only itself. Deliberately crude.
     */
    fun singular(word: String): String {
        if (word.length > 4 && Regex("(ss|sh|ch|x)es$").containsMatchIn(word)) return word.dropLast(2)
        if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !Regex("\\d").containsMatchIn(word)) return word.dropLast(1)
        return word
    }

    fun tokens(term: String): List<String> {
        val words = term.lowercase().split(Regex("\\s+")).map { EDGE.replace(it, "") }.filter { it.isNotEmpty() }
        val meaningful = words.filter { it !in STOPWORDS }
        return meaningful.ifEmpty { words }.take(MAX_TOKENS).map(::singular)
    }
}
