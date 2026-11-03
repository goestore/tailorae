package com.tailorae.content

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ImageProbeTest {

    companion object {
        fun encoded(format: String, width: Int, height: Int): ByteArray {
            val type = if (format == "jpg") BufferedImage.TYPE_INT_RGB else BufferedImage.TYPE_INT_ARGB
            val out = ByteArrayOutputStream()
            ImageIO.write(BufferedImage(width, height, type), format, out)
            return out.toByteArray()
        }

        /** A minimal lossless WebP header (RIFF, VP8L chunk) for [width]×[height]. */
        fun webpLossless(width: Int, height: Int): ByteArray {
            val w = width - 1
            val h = height - 1
            val bits = w or (h shl 14)
            val header = "RIFF".toByteArray() + byteArrayOf(0, 0, 0, 0) + "WEBPVP8L".toByteArray() + byteArrayOf(5, 0, 0, 0, 0x2F)
            return header + byteArrayOf(bits.toByte(), (bits shr 8).toByte(), (bits shr 16).toByte(), (bits shr 24).toByte(), 0, 0, 0, 0)
        }
    }

    @Test
    fun `reads PNG JPEG and GIF dimensions from the header`() {
        assertEquals(ImageInfo("png", "image/png", 40, 30), ImageProbe.probe(encoded("png", 40, 30)))
        assertEquals(ImageInfo("jpeg", "image/jpeg", 64, 48), ImageProbe.probe(encoded("jpg", 64, 48)))
        assertEquals(ImageInfo("gif", "image/gif", 7, 9), ImageProbe.probe(encoded("gif", 7, 9)))
        assertEquals("jpg", ImageProbe.probe(encoded("jpg", 2, 2))!!.extension)
    }

    @Test
    fun `reads lossless and extended WebP`() {
        assertEquals(ImageInfo("webp", "image/webp", 300, 200), ImageProbe.probe(webpLossless(300, 200)))
        val vp8x = "RIFF".toByteArray() + byteArrayOf(0, 0, 0, 0) + "WEBPVP8X".toByteArray() +
            byteArrayOf(10, 0, 0, 0, 0, 0, 0, 0) + byteArrayOf((1919 and 0xFF).toByte(), (1919 shr 8).toByte(), 0) +
            byteArrayOf((1079 and 0xFF).toByte(), (1079 shr 8).toByte(), 0)
        assertEquals(ImageInfo("webp", "image/webp", 1920, 1080), ImageProbe.probe(vp8x))
    }

    @Test
    fun `refuses anything that only claims to be an image`() {
        assertNull(ImageProbe.probe("hello, I am a png".toByteArray()))
        assertNull(ImageProbe.probe(byteArrayOf()))
        // A PNG signature with a truncated header.
        assertNull(ImageProbe.probe(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0)))
        assertNull(ImageProbe.probe("%PDF-1.4\n".toByteArray()))
    }

    @Test
    fun `spots PDF and SVG by their bytes`() {
        assertTrue(ImageProbe.isPdf("%PDF-1.7 ...".toByteArray()))
        assertTrue(ImageProbe.looksLikeSvg("﻿  <?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".toByteArray()))
        assertTrue(!ImageProbe.looksLikeSvg("<html><body>svg</body></html>".toByteArray()))
    }
}
