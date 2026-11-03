package com.tailorae.common

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IdsTest {
    @Test
    fun `ids are version 7 with the RFC variant`() {
        val id = Ids.newId()
        assertEquals(7, id.version())
        assertEquals(2, id.variant())
    }

    @Test
    fun `ids sort by creation time`() {
        val earlier = Ids.newId(1_700_000_000_000)
        val later = Ids.newId(1_700_000_000_001)
        assertTrue(earlier.toString() < later.toString())
    }

    @Test
    fun `the timestamp is recoverable from the id`() {
        val millis = 1_762_000_000_123
        assertEquals(millis, Ids.newId(millis).mostSignificantBits ushr 16)
    }
}
