package com.tailorae.catalog.rules

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Colour cards (legacy product-colors.ts had no tests; these pin its behaviour) and query tokens. */
class ProductColorsTest {
    private val product = ProductLike(thumbnail = "/p.webp", images = listOf("/p.webp", "/q.webp"), color = "Navy", quantity = 3)

    private fun v(id: String, color: String?, size: String?, qty: Int, images: List<String> = emptyList(), family: String? = null) =
        VariantLike(id, color, size, "SKU-$id", qty, images, colorFamily = family)

    @Test
    fun `one card per colour, grouped case-insensitively, with summed stock`() {
        val cards = ProductColors.cards(
            product,
            listOf(
                v("1", "Navy", "S", 2, listOf("/n1.webp"), "Navy Blue"),
                v("2", "navy ", "M", 3),
                v("3", "Red", "S", -1, family = "Red"),
            ),
        )
        assertEquals(listOf("Navy", "Red"), cards.map { it.name })
        assertEquals(5, cards[0].stock)
        assertEquals("/n1.webp", cards[0].image)
        // The family's own swatch, since the seller picked none.
        assertEquals(ColourFamilies.byName("Navy Blue")!!.hex, cards[0].hex)
        assertEquals(0, cards[1].stock)
        assertEquals("/p.webp", cards[1].image)
    }

    @Test
    fun `a product without coloured variants gets one card from its own colour, or none`() {
        val cards = ProductColors.cards(product.copy(colorFamily = "Navy Blue"), emptyList())
        assertEquals(1, cards.size)
        assertEquals("navy", cards[0].id)
        assertEquals(3, cards[0].stock)
        assertEquals(emptyList(), ProductColors.cards(product.copy(color = null), emptyList()))
    }

    @Test
    fun `the seller's swatch wins, and Multi has no single shade`() {
        val hexes = mapOf<String, Any?>("NAVY" to "#000080")
        assertEquals("#000080", ProductColors.cards(product.copy(colourHexes = hexes), listOf(v("1", "Navy", "S", 1, family = "Navy Blue")))[0].hex)
        assertNull(ProductColors.cards(product, listOf(v("1", "Black & Purple", "S", 1, family = "Multi")))[0].hex)
    }

    @Test
    fun `details carry the gallery and the sizes in size-chart order`() {
        val details = ProductColors.details(
            product,
            listOf(v("1", "Navy", "XL", 1, listOf("/a.webp")), v("2", "Navy", "S", 2, listOf("/a.webp", "/b.webp")), v("3", "Navy", "M", 0)),
        )
        assertEquals(1, details.size)
        assertEquals(listOf("S", "M", "XL"), details[0].sizes.map { it.size })
        assertEquals(listOf("/a.webp", "/b.webp"), details[0].images)
        assertEquals(3, details[0].stock)
    }

    @Test
    fun `kids sizes sort by their first number when the chart does not know them`() {
        assertEquals(listOf("2-3Y-x", "11-12Y-x"), listOf("11-12Y-x", "2-3Y-x").sortedWith(ProductColors.sizeOrder))
    }

    @Test
    fun `stock with sizes is the sum of the sizes`() {
        assertEquals(10, ProductColors.effectiveStock(0, listOf(4, 6, -2)))
        assertEquals(7, ProductColors.effectiveStock(7, emptyList()))
    }

    @Test
    fun `distinct colour names keep the first spelling`() {
        assertEquals(listOf("Navy", "red"), ProductColors.distinctColorNames(listOf("Navy", "navy", null, " red ", "")))
    }

    @Test
    fun `search tokens drop stopwords, edge punctuation and plurals`() {
        assertEquals(listOf("black", "polo"), SearchText.tokens("  Black POLOS! "))
        assertEquals(listOf("girl", "dress"), SearchText.tokens("girls dresses for the"))
        assertEquals(listOf("the"), SearchText.tokens("the"))
        assertEquals(6, SearchText.tokens("a b c d e f g h").size)
        assertEquals("dress", SearchText.singular("dress"))
        assertEquals("box", SearchText.singular("boxes"))
        assertEquals("2xls", SearchText.singular("2xls"))
    }
}
