package com.tailorae.catalog.rules

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Port of legacy-api/src/utils/colour-families.test.ts, plus the write hook. */
class ColourFamiliesTest {
    private fun fam(name: String, hex: String? = null) = ColourFamilies.suggest(name, hex)?.name

    @Test
    fun `has unique slugs`() {
        val slugs = ColourFamilies.ALL.map { it.slug }
        assertEquals(slugs.size, slugs.toSet().size)
    }

    @Test
    fun `reads any spelling of a family name`() {
        for (value in listOf("Navy Blue", "navy blue", " NAVY  BLUE ", "navy-blue", "Navyblue")) {
            assertEquals("Navy Blue", ColourFamilies.canonical(value)?.name, value)
        }
        assertEquals("Off White", ColourFamilies.canonical("Off-White")?.name)
        assertEquals("Grey Melange", ColourFamilies.canonical("grey melange")?.name)
        assertNull(ColourFamilies.canonical("not a colour"))
    }

    @Test
    fun `maps everyday and trade names`() {
        assertEquals("Navy Blue", fam("Navy"))
        assertEquals("Burgundy", fam("Wine"))
        assertEquals("Olive", fam("Mehendi"))
        assertEquals("Off White", fam("Ivory"))
        assertEquals("Magenta", fam("Rani Pink"))
        assertEquals("Multi", fam("Multicolour"))
        assertEquals("Grey", fam("Gray"))
    }

    @Test
    fun `finds the colour noun inside a descriptive name`() {
        assertEquals("Rose", fam("Dusty Rose"))
        assertEquals("Green", fam("Bottle Green"))
        assertEquals("Navy Blue", fam("Dark Navy Blue"))
        assertEquals("Peach", fam("Pastel Peach Floral"))
    }

    @Test
    fun `forgives one typo`() {
        assertEquals("Maroon", fam("Mroon"))
        assertEquals("Purple", fam("Purpel"))
        assertEquals("Navy Blue", fam("Nevy Blue"))
        assertEquals("Lavender", fam("Lavendar"))
        assertEquals("Rose", fam("Dusty Rse"))
        assertNull(fam("Tab"))
    }

    @Test
    fun `treats two colours as Multi`() {
        assertEquals("Multi", fam("Black & Purple"))
        assertEquals("Multi", fam("Pink and Blue"))
    }

    @Test
    fun `falls back to the nearest family to the swatch`() {
        assertEquals("Red", fam("Sunset Glow", "#C62929"))
        assertEquals("Navy Blue", fam("Ocean", "#1F2A45"))
        assertNull(fam("Ocean"))
    }

    @Test
    fun `the write hook normalises a sent family and derives one from the colour`() {
        val variant = mutableMapOf<String, Any?>("colorFamily" to "navy blue")
        ColourFamilySync.variant(variant)
        assertEquals("Navy Blue", variant["colorFamily"])

        val unknown = mutableMapOf<String, Any?>("colorFamily" to "sunset", "color" to "Dusty Rose")
        ColourFamilySync.variant(unknown)
        assertEquals("Rose", unknown["colorFamily"])

        val recoloured = mutableMapOf<String, Any?>("color" to "Bottle Green")
        ColourFamilySync.variant(recoloured)
        assertEquals("Green", recoloured["colorFamily"])

        val cleared = mutableMapOf<String, Any?>("color" to null)
        ColourFamilySync.variant(cleared)
        assertNull(cleared["colorFamily"])

        val untouched = mutableMapOf<String, Any?>("size" to "M")
        ColourFamilySync.variant(untouched)
        assertEquals(false, "colorFamily" in untouched)
    }

    @Test
    fun `a product prefers its prominent colour and leaves the family alone when it cannot say better`() {
        val product = mutableMapOf<String, Any?>("primaryColour" to "Pink", "color" to "Navy")
        ColourFamilySync.product(product)
        assertEquals("Pink", product["colorFamily"])

        val named = mutableMapOf<String, Any?>("brandColour" to "Mehendi")
        ColourFamilySync.product(named)
        assertEquals("Olive", named["colorFamily"])

        val notOnList = mutableMapOf<String, Any?>("colorFamily" to "sunset")
        ColourFamilySync.product(notOnList)
        assertNull(notOnList["colorFamily"])

        val unrelated = mutableMapOf<String, Any?>("name" to "Polo")
        ColourFamilySync.product(unrelated)
        assertEquals(false, "colorFamily" in unrelated)
    }
}
