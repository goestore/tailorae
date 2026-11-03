package com.tailorae.common

import java.text.Normalizer

/**
 * URL slugs. Slugs are globally unique (they are URLs), so [unique] appends
 * `-2`, `-3`, … until [taken] says no.
 */
object Slugs {
    private val nonAlnum = Regex("[^a-z0-9]+")
    private val marks = Regex("\\p{M}+")

    fun slugify(text: String, maxLength: Int = 80): String {
        val ascii = marks.replace(Normalizer.normalize(text.lowercase(), Normalizer.Form.NFD), "")
        val slug = nonAlnum.replace(ascii, "-").trim('-').take(maxLength).trimEnd('-')
        return slug.ifEmpty { "item" }
    }

    fun unique(text: String, taken: (String) -> Boolean): String {
        val base = slugify(text)
        if (!taken(base)) return base
        var n = 2
        while (taken("$base-$n")) n++
        return "$base-$n"
    }
}
