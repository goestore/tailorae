package com.tailorae.customwear

import com.tailorae.content.ImageProbeTest
import com.tailorae.content.items
import com.tailorae.notification.MailCapture
import com.tailorae.support.IntegrationTest
import com.tailorae.support.TestClient
import org.junit.jupiter.api.Test
import java.net.URI
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CustomWearIntegrationTest : IntegrationTest() {

    private fun createProduct(admin: TestClient, name: String = unique("Classic Polo"), gender: String = "men"): tools.jackson.databind.JsonNode =
        admin.post(
            "/api/admin/custom-wear/products",
            mapOf(
                "name" to name, "sku" to unique("TL-MP").uppercase(), "gender" to gender, "category" to "mens-polo", "productType" to "polo",
                "fabric" to "cotton-100", "gsm" to 220, "basePricePaise" to 45_000, "minOrderQuantity" to 10,
                "priceTiers" to listOf(mapOf("minQty" to 10, "maxQty" to 49, "pricePerUnitPaise" to 45_000), mapOf("minQty" to 50, "pricePerUnitPaise" to 57_000)),
                "colors" to listOf(mapOf("id" to "navy", "name" to "Navy", "hex" to "#1F2A44")),
                "sizes" to listOf(mapOf("id" to "M", "label" to "M"), mapOf("id" to "L", "label" to "L")),
                "customizationMethods" to listOf(mapOf("id" to "embroidery", "supported" to true, "setupFeePaise" to 50_000)),
                "customizationLocations" to listOf(mapOf("id" to "left-chest", "supported" to true)),
                "images" to listOf(mapOf("id" to "front", "url" to "/media/polo.webp", "alt" to "Navy polo", "role" to "front")),
            ),
        ).expect(201).data.get("product")

    @Test
    fun `staff manage the catalogue and the storefront filters it`() {
        val admin = admin()
        val product = createProduct(admin)
        assertEquals(57_000, product.get("maxPricePaise").asLong(), "range from the tiers")
        val slug = product.get("slug").asString()

        val shop = anonymous()
        assertEquals(slug, shop.get("/api/custom-wear/products/$slug").expect(200).data.get("product").get("slug").asString())
        val listing = shop.get("/api/custom-wear/products?category=mens-polo&color=navy&method=embroidery&q=${product.get("sku").asString()}").expect(200)
        assertEquals(1, listing.data.get("total").asInt())
        assertEquals("1", listing.header("X-Total-Count"))
        assertEquals(0, shop.get("/api/custom-wear/products?q=${product.get("sku").asString()}&gender=women").expect(200).data.get("total").asInt())
        assertTrue(shop.get("/api/custom-wear/products/slugs").expect(200).body.contains(slug))
        shop.get("/api/custom-wear/products/$slug/related").expect(200)

        // Hidden from the storefront once deactivated; staff still see it.
        val body = admin.get("/api/admin/custom-wear/products/${product.get("id").asString()}").expect(200).data.get("product")
        admin.put("/api/admin/custom-wear/products/${body.get("id").asString()}", json.convertValue(body, Map::class.java).toMutableMap().apply { put("isActive", false) }).expect(200)
        shop.get("/api/custom-wear/products/$slug").expect(404)

        admin.post("/api/admin/custom-wear/products", mapOf("name" to "Bad", "sku" to "B", "gender" to "men", "category" to "mens-hoodies", "productType" to "polo", "basePricePaise" to 1))
            .expect(400).also { assertTrue(it.message.contains("category mens-hoodies is for hoodie products"), it.message) }
        customer().post("/api/admin/custom-wear/products", mapOf("name" to "x")).expect(401)
    }

    @Test
    fun `a guest requests a quote with artwork, staff work it, the customer sees the status`() {
        val admin = admin()
        val product = createProduct(admin)
        val guest = anonymous()

        val art = guest.upload("/api/custom-wear/artwork", emptyMap(), "file", "logo.png", ImageProbeTest.encoded("png", 31, 17), "image/png").expect(201).data.get("artwork")
        val reference = art.get("url").asString()
        assertTrue(QuoteRules.ARTWORK_REFERENCE.matches(reference), reference)
        assertEquals(31, art.get("width").asInt())
        // The artwork is private: its key is never served from the public bucket.
        val key = jdbc.sql("select storage_key from custom_wear_artwork where id = :id").param("id", java.util.UUID.fromString(art.get("id").asString()))
            .query(String::class.java).single()
        assertEquals(404, guest.get("/media/$key").status)
        guest.upload("/api/custom-wear/artwork", emptyMap(), "file", "x.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>".toByteArray(), "image/svg+xml").expect(400)

        val email = "${unique("buyer")}@example.com"
        val invalid = guest.post("/api/custom-wear/quotes", mapOf("productId" to product.get("id").asString(), "quantity" to 0)).expect(422)
        assertTrue(invalid.tree.get("errors").size() >= 3, invalid.body)

        val created = guest.post(
            "/api/custom-wear/quotes",
            mapOf(
                "productId" to product.get("id").asString(), "productSlug" to "ignored", "productName" to "ignored", "sku" to "ignored",
                "colorName" to "Navy", "sizes" to listOf("M", "L"), "quantity" to 60, "designFiles" to listOf(reference),
                "placements" to listOf(mapOf("location" to "left-chest", "method" to "embroidery", "designFileName" to "logo.png", "widthPercent" to 40)),
                "customerName" to "Asha Rao", "company" to "Loom Co", "email" to email, "country" to "India", "postcode" to "302001",
            ),
        ).expect(201).data
        val ref = created.get("reference").asString()
        assertTrue(QuoteRules.REFERENCE.matches(ref), ref)
        assertTrue(created.get("persisted").asBoolean())
        assertEquals(product.get("name").asString(), created.get("quote").get("productName").asString(), "product fields come from the catalogue")
        assertEquals("left-chest", created.get("quote").get("locations").get(0).asString())

        // Guest status check needs the matching email.
        assertEquals("NEW", guest.get("/api/custom-wear/quotes/$ref?email=$email").expect(200).data.get("quote").get("status").asString())
        guest.get("/api/custom-wear/quotes/$ref?email=someone@example.com").expect(404)
        guest.get("/api/custom-wear/quotes/nope?email=$email").expect(400)

        // Acknowledgement to the customer, alert to staff.
        val ack = MailCapture.await(mail, email, ref).single()
        assertTrue(MailCapture.text(ack).contains("custom-wear/quotes?reference=$ref"), MailCapture.text(ack))
        MailCapture.await(mail, "admin@tailorae.com", ref)

        // Staff see the artwork through a signed link, and move the quote along.
        val list = admin.get("/api/admin/custom-wear/quotes?search=$ref").expect(200).data
        assertEquals(1, list.get("quotes").size())
        assertEquals(1, list.get("counts").get("NEW").asInt())
        val id = list.get("quotes").get(0).get("id").asString()
        val detail = admin.get("/api/admin/custom-wear/quotes/$ref").expect(200).data.get("quote")
        assertEquals(id, detail.get("id").asString())
        assertTrue(detail.get("notes").asString().contains("left-chest · embroidery · file logo.png · 40% width"))
        val signed = URI(detail.get("designFiles").get(0).asString()).let { "${it.rawPath}?${it.rawQuery}" }
        assertEquals(200, anonymous().get(signed).status)

        admin.patch("/api/admin/custom-wear/quotes/$id", mapOf("status" to "MAYBE")).expect(400)
        val quoted = admin.patch("/api/admin/custom-wear/quotes/$id", mapOf("status" to "QUOTED", "quotedPricePaise" to 2_850_000, "adminNotes" to "Proof sent")).expect(200).data.get("quote")
        assertEquals("QUOTED", quoted.get("status").asString())
        assertEquals("Proof sent", quoted.get("adminNotes").asString())
        val seen = guest.get("/api/custom-wear/quotes/$ref?email=$email").expect(200).data.get("quote")
        assertEquals(2_850_000, seen.get("quotedPricePaise").asLong())
        assertTrue(seen.get("adminNotes") == null, "internal notes stay internal")
        val audited = jdbc.sql("select count(*) from audit_log where entity = 'custom_wear_quote' and entity_id = :id").param("id", id).query(Long::class.javaObjectType).single()
        assertEquals(1L, audited)
    }

    @Test
    fun `a signed-in customer's quotes are listed as theirs, a batch is all or nothing`() {
        val admin = admin()
        val product = createProduct(admin)
        val name = unique("shopper")
        val shopper = customer(name)
        val contact = mapOf("customerName" to "Ravi", "email" to "$name@example.com", "country" to "India")
        val line = mapOf("productId" to product.get("id").asString(), "quantity" to 12, "sizes" to listOf("M"))

        shopper.post("/api/custom-wear/quotes/batch", contact + mapOf("items" to listOf(line, mapOf("productId" to "nope", "quantity" to 1))))
            .expect(422).also { assertTrue(it.body.contains("items[1]: productId does not match a custom wear product"), it.body) }
        val batch = shopper.post("/api/custom-wear/quotes/batch", contact + mapOf("items" to listOf(line, line))).expect(201).data
        assertEquals(2, batch.get("references").size())
        val mine = shopper.get("/api/custom-wear/quotes/mine").expect(200).data.get("quotes").items().map { it.get("reference").asString() }.toSet()
        assertEquals(batch.get("references").items().map { it.asString() }.toSet(), mine)
        anonymous().get("/api/custom-wear/quotes/mine").expect(401)
    }
}
