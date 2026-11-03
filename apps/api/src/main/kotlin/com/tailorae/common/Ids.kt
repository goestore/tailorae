package com.tailorae.common

import java.security.SecureRandom
import java.util.UUID

/**
 * UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then randomness. Ids sort by
 * creation time, so B-tree inserts stay append-mostly instead of scattering
 * across the index the way random v4 ids do.
 */
object Ids {
    private val random = SecureRandom()

    fun newId(nowMillis: Long = System.currentTimeMillis()): UUID {
        val rand = ByteArray(10).also(random::nextBytes)
        val msb = (nowMillis shl 16) or
            (0x7L shl 12) or // version 7
            ((rand[0].toLong() and 0x0F) shl 8) or (rand[1].toLong() and 0xFF)
        var lsb = 0L
        for (i in 2 until 10) lsb = (lsb shl 8) or (rand[i].toLong() and 0xFF)
        lsb = (lsb and 0x3FFFFFFFFFFFFFFFL) or Long.MIN_VALUE // variant 10xx
        return UUID(msb, lsb)
    }
}
