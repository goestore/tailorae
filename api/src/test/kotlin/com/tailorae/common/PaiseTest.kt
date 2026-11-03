package com.tailorae.common

import kotlin.test.Test
import kotlin.test.assertEquals

class PaiseTest {
    @Test
    fun `commission in basis points rounds half up to the paisa`() {
        assertEquals(Paise(10_000), Paise(100_000).percentBp(1_000)) // 10% of ₹1000
        assertEquals(Paise(1), Paise(5).percentBp(1_000)) // 0.5 paise rounds up
        assertEquals(Paise(0), Paise(4).percentBp(1_000)) // 0.4 paise rounds down
    }

    @Test
    fun `formats as rupees`() {
        assertEquals("₹1499.50", Paise(149_950).toString())
    }
}
