package com.tailorae.content

/** What an upload really is, read from its bytes. */
data class ImageInfo(val format: String, val contentType: String, val width: Int, val height: Int) {
    /** File extension for the stored key. */
    val extension: String get() = if (format == "jpeg") "jpg" else format
}

/**
 * Identifies an image by its signature and reads its pixel size from the
 * header — never trusting the filename or the `Content-Type` the client sent.
 * Supports JPEG, PNG, WebP (lossy, lossless, extended) and GIF.
 *
 * Returns null for anything that is not one of those or whose header is
 * truncated or nonsensical, so a text file renamed `.png` is refused.
 */
object ImageProbe {
    private const val MAX_EDGE = 30_000

    fun probe(bytes: ByteArray): ImageInfo? = runCatching {
        when {
            isPng(bytes) -> png(bytes)
            isJpeg(bytes) -> jpeg(bytes)
            isWebp(bytes) -> webp(bytes)
            isGif(bytes) -> gif(bytes)
            else -> null
        }
    }.getOrNull()?.takeIf { it.width in 1..MAX_EDGE && it.height in 1..MAX_EDGE }

    fun isPdf(bytes: ByteArray) = bytes.startsWith("%PDF-".toByteArray())

    /** SVG is XML that can carry script; callers refuse it rather than serve it back. */
    fun looksLikeSvg(bytes: ByteArray): Boolean {
        val head = String(bytes, 0, minOf(bytes.size, 2048), Charsets.UTF_8).removePrefix("﻿").trimStart()
        return head.startsWith("<") && Regex("<svg[\\s>]", RegexOption.IGNORE_CASE).containsMatchIn(head)
    }

    private fun isPng(b: ByteArray) = b.startsWith(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))
    private fun isJpeg(b: ByteArray) = b.startsWith(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()))
    private fun isGif(b: ByteArray) = b.startsWith("GIF87a".toByteArray()) || b.startsWith("GIF89a".toByteArray())
    private fun isWebp(b: ByteArray) = b.size >= 16 && b.startsWith("RIFF".toByteArray()) && b.copyOfRange(8, 12).contentEquals("WEBP".toByteArray())

    // PNG: the IHDR chunk is first; width and height are big-endian at 16 and 20.
    private fun png(b: ByteArray): ImageInfo? {
        if (b.size < 24 || String(b, 12, 4, Charsets.US_ASCII) != "IHDR") return null
        return ImageInfo("png", "image/png", be32(b, 16), be32(b, 20))
    }

    // GIF: logical screen size, little-endian at 6 and 8.
    private fun gif(b: ByteArray): ImageInfo? {
        if (b.size < 10) return null
        return ImageInfo("gif", "image/gif", le16(b, 6), le16(b, 8))
    }

    // JPEG: walk the markers to the first start-of-frame (SOF0–SOF15 except DHT, JPG, DAC).
    private fun jpeg(b: ByteArray): ImageInfo? {
        var i = 2
        while (i + 9 < b.size) {
            if (u8(b, i) != 0xFF) return null
            val marker = u8(b, i + 1)
            if (marker == 0xFF) { i++; continue }
            if (marker == 0xD8 || marker == 0x01 || marker in 0xD0..0xD7) { i += 2; continue }
            val length = be16(b, i + 2)
            if (length < 2) return null
            if (marker in 0xC0..0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC) {
                return ImageInfo("jpeg", "image/jpeg", width = be16(b, i + 7), height = be16(b, i + 5))
            }
            if (marker == 0xDA || marker == 0xD9) return null
            i += 2 + length
        }
        return null
    }

    // WebP: the first chunk after the RIFF header says which bitstream follows.
    private fun webp(b: ByteArray): ImageInfo? {
        val chunk = String(b, 12, 4, Charsets.US_ASCII)
        return when (chunk) {
            "VP8 " -> {
                if (b.size < 30 || u8(b, 23) != 0x9D || u8(b, 24) != 0x01 || u8(b, 25) != 0x2A) return null
                ImageInfo("webp", "image/webp", le16(b, 26) and 0x3FFF, le16(b, 28) and 0x3FFF)
            }
            "VP8L" -> {
                if (b.size < 25 || u8(b, 20) != 0x2F) return null
                val b1 = u8(b, 22); val b2 = u8(b, 23); val b3 = u8(b, 24)
                val width = 1 + (((b1 and 0x3F) shl 8) or u8(b, 21))
                val height = 1 + (((b3 and 0x0F) shl 10) or (b2 shl 2) or ((b1 and 0xC0) shr 6))
                ImageInfo("webp", "image/webp", width, height)
            }
            "VP8X" -> {
                if (b.size < 30) return null
                ImageInfo("webp", "image/webp", 1 + le24(b, 24), 1 + le24(b, 27))
            }
            else -> null
        }
    }

    private fun u8(b: ByteArray, i: Int) = b[i].toInt() and 0xFF
    private fun be16(b: ByteArray, i: Int) = (u8(b, i) shl 8) or u8(b, i + 1)
    private fun be32(b: ByteArray, i: Int) = (u8(b, i) shl 24) or (u8(b, i + 1) shl 16) or (u8(b, i + 2) shl 8) or u8(b, i + 3)
    private fun le16(b: ByteArray, i: Int) = u8(b, i) or (u8(b, i + 1) shl 8)
    private fun le24(b: ByteArray, i: Int) = u8(b, i) or (u8(b, i + 1) shl 8) or (u8(b, i + 2) shl 16)

    private fun ByteArray.startsWith(prefix: ByteArray) = size >= prefix.size && copyOfRange(0, prefix.size).contentEquals(prefix)
}
