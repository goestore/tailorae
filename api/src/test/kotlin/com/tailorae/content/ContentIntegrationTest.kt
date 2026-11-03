package com.tailorae.content

import com.tailorae.support.IntegrationTest
import org.junit.jupiter.api.Test
import java.net.URI
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ContentIntegrationTest : IntegrationTest() {

    private fun namespace() = unique("ns").lowercase().replace(Regex("[^a-z0-9-]"), "-").take(60)

    @Test
    fun `a draft reaches the storefront only when published, and private values never do`() {
        val admin = admin()
        val ns = namespace()
        admin.put(
            "/api/admin/content/$ns",
            mapOf(
                "values" to listOf(
                    mapOf("path" to "/hero/heading", "value" to "Made for monsoon"),
                    mapOf("path" to "/pricing/costFloor", "value" to 41000, "isPrivate" to true),
                    mapOf("path" to "/hero/cta", "value" to null),
                ),
            ),
        ).expect(200).also { assertEquals(3, it.data.get("draft").size()) }

        // Drafts are preview-only.
        val before = anonymous().get("/api/content/$ns").expect(200).data
        assertEquals(0, before.get("version").asInt())
        assertEquals(0, before.get("values").size())

        val published = admin.post("/api/admin/content/$ns/publish").expect(200)
        assertEquals("Published 3 value(s) as version 1", published.message)
        assertFalse(published.data.get("revalidated").asBoolean(), "no hook configured in tests")
        admin.post("/api/admin/content/$ns/publish").expect(409)

        val live = anonymous().get("/api/content/$ns").expect(200).data
        assertEquals(1, live.get("version").asInt())
        val values = live.get("values").items().associate { it.get("path").asString() to it.get("value") }
        assertEquals(setOf("/hero/heading", "/hero/cta"), values.keys)
        assertEquals("Made for monsoon", values["/hero/heading"]!!.asString())
        assertTrue(values["/hero/cta"]!!.isNull)
        assertFalse(anonymous().get("/api/content/$ns").body.contains("41000"))

        // Staff see both stages, private included.
        val stages = admin.get("/api/admin/content/$ns").expect(200).data
        assertEquals(3, stages.get("published").size())
        assertEquals(0, stages.get("draft").size())

        // A value that becomes private stops being served instead of falling back to its older public version.
        admin.put("/api/admin/content/$ns", mapOf("values" to listOf(mapOf("path" to "/hero/heading", "value" to "Secret launch", "isPrivate" to true)))).expect(200)
        admin.post("/api/admin/content/$ns/publish").expect(200)
        val after = anonymous().get("/api/content/$ns").expect(200)
        assertFalse(after.body.contains("Made for monsoon") || after.body.contains("Secret launch"), after.body)

        // History keeps both snapshots, newest first; the publish was announced for revalidation.
        val history = admin.get("/api/admin/content/$ns/history").expect(200).data.get("publishes")
        assertEquals(2, history.size())
        assertEquals(2, history.get(0).get("after").get("version").asInt())
        assertEquals(1, history.get(0).get("before").get("version").asInt())
        val events = jdbc.sql("select count(*) from outbox_event where topic = 'content.published' and event_key = :ns").param("ns", ns)
            .query(Long::class.javaObjectType).single()
        assertEquals(2L, events)
    }

    @Test
    fun `drafts can be discarded, and bad writes are refused with the legacy messages`() {
        val admin = admin()
        val ns = namespace()
        admin.put("/api/admin/content/$ns", mapOf("values" to listOf(mapOf("path" to "/a", "value" to 1)))).expect(200)
        assertEquals(1, admin.delete("/api/admin/content/$ns/draft").expect(200).data.get("discarded").asInt())
        admin.post("/api/admin/content/$ns/publish").expect(409)

        val bad = admin.put("/api/admin/content/$ns", mapOf("values" to listOf(mapOf("path" to "a")))).expect(400)
        assertEquals("values[0].path must be a JSON pointer, e.g. /hero/heading", bad.message)
        admin.get("/api/admin/content/Not_A_Slug").expect(400)
        anonymous().get("/api/content/Not_A_Slug").expect(400)

        // Staff realm only: a shopper's session is not an admin session.
        customer().put("/api/admin/content/$ns", mapOf("values" to listOf(mapOf("path" to "/a", "value" to 1)))).expect(401)
    }

    @Test
    fun `media uploads are identified by their bytes and deduplicated`() {
        val admin = admin()
        val image = ImageProbeTest.encoded("png", 13 + (System.nanoTime() % 50).toInt(), 9)
        val first = admin.upload("/api/admin/media", mapOf("alt" to "Linen swatch"), "file", "swatch.jpg", image, "image/jpeg").expect(201).data.get("asset")
        assertEquals("Linen swatch", first.get("alt").asString())
        assertEquals("image/png", first.get("contentType").asString())
        assertEquals(9, first.get("height").asInt())
        val again = admin.upload("/api/admin/media", emptyMap(), "file", "copy.png", image, "image/png").expect(201).data.get("asset")
        assertEquals(first.get("id").asString(), again.get("id").asString())

        // Served publicly from the PUBLIC bucket.
        val path = URI(first.get("url").asString()).rawPath
        assertEquals(200, anonymous().get(path).status)

        admin.upload("/api/admin/media", emptyMap(), "file", "notes.png", "not an image".toByteArray(), "image/png").expect(400)
        assertTrue(admin.get("/api/admin/media").expect(200).data.get("assets").items().any { it.get("id") == first.get("id") })

        val id = first.get("id").asString()
        assertEquals("Woven linen", admin.patch("/api/admin/media/$id", mapOf("alt" to "Woven linen")).expect(200).data.get("asset").get("alt").asString())
        admin.delete("/api/admin/media/$id").expect(200)
        admin.patch("/api/admin/media/$id", mapOf("alt" to "x")).expect(404)
        assertEquals(404, anonymous().get(path).status)
    }

    @Test
    fun `banners are managed by staff and the storefront sees live ones`() {
        val admin = admin()
        val title = unique("Festive")
        admin.post("/api/admin/banners", mapOf("title" to "x")).expect(400).also { assertEquals("image is required", it.message) }
        val created = admin.post("/api/admin/banners", mapOf("title" to title, "image" to "/media/b.webp", "position" to "homepage", "displayOrder" to 2))
            .expect(201).data.get("banner")
        assertEquals("HOMEPAGE", created.get("position").asString())
        val id = created.get("id").asString()
        assertTrue(anonymous().get("/api/banners?position=HOMEPAGE").expect(200).body.contains(title))

        admin.put("/api/admin/banners/$id", mapOf("endDate" to "2020-01-01")).expect(200)
        assertFalse(anonymous().get("/api/banners").expect(200).body.contains(title))
        admin.put("/api/admin/banners/$id", mapOf("isActive" to "yes")).expect(400)
        admin.delete("/api/admin/banners/$id").expect(200)
        admin.delete("/api/admin/banners/$id").expect(404)
    }
}
