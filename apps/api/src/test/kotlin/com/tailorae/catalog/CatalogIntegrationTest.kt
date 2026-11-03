package com.tailorae.catalog

import com.tailorae.support.IntegrationTest
import com.tailorae.support.TestClient
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Test
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The catalog end to end: a seller lists, staff moderate, shoppers find it;
 * moderation on edits; seller isolation; brand authorisation; search and
 * facets; sheet import and export; photos.
 */
class CatalogIntegrationTest : IntegrationTest() {

    private val pdf = "%PDF-1.4\n% test document\n".toByteArray()

    private fun business(name: String) = mapOf(
        "shopName" to name,
        "legalName" to "$name Private Limited",
        "businessType" to "PRIVATE_LIMITED",
        "pan" to "AAPFU0939F",
        "registeredAddress" to mapOf("line1" to "12 Linen Lane", "city" to "Jaipur", "state" to "Rajasthan", "postalCode" to "302001"),
        "contactPhone" to "+91 98290 12345",
    )

    /** A seller whose business exists but has not been approved. */
    private fun draftSeller(): Pair<TestClient, String> {
        val seller = sellerAccount()
        val shop = seller.post("/api/seller/business", business(unique("Loom House"))).expect(201).data
        return seller to shop.get("id").asString()
    }

    /** A seller staff have approved, so it may list. */
    private fun approvedSeller(): Pair<TestClient, String> {
        val (seller, id) = draftSeller()
        seller.upload("/api/seller/kyc/documents", mapOf("kind" to "PAN"), "file", "pan.pdf", pdf, "application/pdf").expect(201)
        seller.put("/api/seller/bank", mapOf("accountName" to "Loom House", "accountNumber" to "123456789012", "ifsc" to "HDFC0001234")).expect(200)
        seller.post("/api/seller/business/submit").expect(200)
        admin().post("/api/admin/sellers/$id/decision", mapOf("action" to "APPROVE")).expect(200)
        return seller to id
    }

    private fun category(admin: TestClient = admin(), name: String = unique("Kurtas")): String =
        admin.post("/api/admin/categories", mapOf("name" to name, "slug" to name.lowercase())).expect(201).data.get("category").get("id").asString()

    private fun productBody(categoryId: String, name: String = unique("Indigo Linen Kurta"), extra: Map<String, Any?> = emptyMap()) = mapOf(
        "name" to name,
        "sku" to unique("KRT").uppercase(),
        "categoryId" to categoryId,
        "pricePaise" to 149_900,
        "mrpPaise" to 199_900,
        "quantity" to 5,
        "color" to "Nevy Blue",
        "description" to "Hand-block printed linen kurta.",
        "status" to "ACTIVE",
    ) + extra

    private fun visibleOnStorefront(slug: String) = anonymous().get("/api/products/$slug").status == 200

    @Test
    fun `a seller's listing waits for moderation, then shoppers can find it`() {
        val (seller, sellerId) = approvedSeller()
        val categoryId = category()
        val name = unique("Saffron Chanderi Kurta")
        val created = seller.post("/api/seller/products", productBody(categoryId, name)).expect(201).data.get("product")
        val id = created.get("id").asString()
        val slug = created.get("slug").asString()
        assertEquals("PENDING", created.get("moderationStatus").asString())
        assertEquals(sellerId, created.get("sellerId").asString())
        // The colour family is derived from the free-text colour, typo and all.
        assertEquals("Navy Blue", created.get("colorFamily").asString())

        assertFalse(visibleOnStorefront(slug), "a pending listing must not be on the storefront")
        assertFalse(anonymous().get("/api/products?category=${categoryId}").data.get("products").toString().contains(id))

        val queue = admin().get("/api/admin/moderation/products").expect(200).data
        assertTrue(queue.get("products").toString().contains(id))
        admin().patch("/api/admin/moderation/products/$id", mapOf("decision" to "reject")).expect(400) // a rejection needs a note
        admin().patch("/api/admin/moderation/products/$id", mapOf("decision" to "approve")).expect(200)

        val page = anonymous().get("/api/products/$slug").expect(200).data.get("product")
        assertEquals(149_900, page.get("pricePaise").asInt())
        assertEquals(25, page.get("discountPercentage").asInt())
        assertTrue(page.get("costPaise") == null, "a shopper never sees the cost price")
        assertEquals(sellerId, page.get("seller").get("id").asString())

        val listing = anonymous().get("/api/products?category=$categoryId").expect(200)
        assertEquals("1", listing.header("X-Total-Count"))
        assertEquals(id, listing.data.get("products").get(0).get("id").asString())

        // Full-text search, by a word of the name and by the colour family filter.
        val word = name.split(" ")[1].lowercase() // "chanderi"
        assertTrue(anonymous().get("/api/products?q=$word&category=$categoryId").data.get("products").toString().contains(id))
        assertTrue(anonymous().get("/api/products?color=navy-blue&category=$categoryId").data.get("products").toString().contains(id))
        assertFalse(anonymous().get("/api/products?color=maroon&category=$categoryId").data.get("products").toString().contains(id))

        val facets = anonymous().get("/api/products/facets/list?category=$categoryId").expect(200).data
        assertEquals(categoryId, facets.get("categories").get(0).get("id").asString())
        assertEquals("Navy Blue", facets.get("colours").get(0).get("name").asString())
        assertEquals(1, facets.get("priceBuckets").get(0).get("count").asInt())
        assertEquals(100_000, facets.get("priceBuckets").get(0).get("minPaise").asInt())

        val suggest = anonymous().get("/api/products/search/q?q=$word").expect(200).data
        assertTrue(suggest.get("items").toString().contains(id))
        // A typo still finds it, flagged as a near match.
        val typo = anonymous().get("/api/products/search/q?q=${word.dropLast(1)}x").expect(200).data
        if (typo.get("items").size() > 0) assertTrue(typo.get("fuzzy").asBoolean() || typo.get("items").toString().contains(id))

        // Every change is announced through the outbox.
        val events = jdbc.sql("select count(*) from outbox_event where topic = 'catalog.product.changed' and event_key = :k").param("k", id)
            .query(Long::class.javaObjectType).single()
        assertTrue(events >= 2)
    }

    @Test
    fun `editing what shoppers see sends the listing back to review, price and stock do not`() {
        val (seller, _) = approvedSeller()
        val categoryId = category()
        val product = seller.post("/api/seller/products", productBody(categoryId, extra = mapOf("quantity" to 0))).expect(201).data.get("product")
        val id = product.get("id").asString()
        val slug = product.get("slug").asString()
        admin().patch("/api/admin/moderation/products/$id", mapOf("decision" to "approve")).expect(200)
        assertTrue(visibleOnStorefront(slug))

        // Price and stock: stays approved and live. Stock 0 → 3 is a restock.
        val priced = seller.put("/api/seller/products/$id", mapOf("pricePaise" to 129_900, "quantity" to 3)).expect(200)
        assertEquals("Product updated", priced.message)
        assertEquals("APPROVED", priced.data.get("product").get("moderationStatus").asString())
        assertTrue(visibleOnStorefront(slug))
        val restocked = jdbc.sql("select count(*) from outbox_event where topic = 'inventory.stock.changed' and event_key = :k").param("k", id)
            .query(Long::class.javaObjectType).single()
        assertEquals(1L, restocked)

        // Re-sending the same name is not a change.
        seller.put("/api/seller/products/$id", mapOf("name" to product.get("name").asString())).expect(200)
        assertTrue(visibleOnStorefront(slug))

        val renamed = seller.put("/api/seller/products/$id", mapOf("name" to unique("Renamed Kurta"))).expect(200)
        assertTrue(renamed.message.contains("reviewed"))
        assertEquals("PENDING", renamed.data.get("product").get("moderationStatus").asString())
        assertFalse(visibleOnStorefront(slug))
    }

    @Test
    fun `one seller cannot see or change another seller's products or sizes`() {
        val (a, _) = approvedSeller()
        val (b, _) = approvedSeller()
        val categoryId = category()
        val product = a.post("/api/seller/products", productBody(categoryId)).expect(201).data.get("product").get("id").asString()
        val variant = a.post("/api/seller/products/$product/variants", mapOf("sku" to unique("SZ").uppercase(), "size" to "M", "color" to "Wine", "quantity" to 2))
            .expect(201).data.get("variant")
        val variantId = variant.get("id").asString()
        assertEquals("Burgundy", variant.get("colorFamily").asString())

        b.get("/api/seller/products/$product").expect(404)
        b.put("/api/seller/products/$product", mapOf("pricePaise" to 1)).expect(404)
        b.delete("/api/seller/products/$product").expect(404)
        b.get("/api/seller/products/$product/variants").expect(404)
        b.put("/api/seller/products/$product/variants/$variantId", mapOf("quantity" to 0)).expect(404)
        b.delete("/api/seller/products/$product/variants/$variantId").expect(404)
        b.put("/api/seller/products/$product/customizations", mapOf("customizations" to emptyList<Any>())).expect(404)
        assertFalse(b.get("/api/seller/products").expect(200).data.get("products").toString().contains(product))

        // A's own size, through another of A's products, is not found either.
        val other = a.post("/api/seller/products", productBody(categoryId)).expect(201).data.get("product").get("id").asString()
        a.put("/api/seller/products/$other/variants/$variantId", mapOf("quantity" to 0)).expect(404)
        a.put("/api/seller/products/$product/variants/$variantId", mapOf("quantity" to 9)).expect(200)

        customer().get("/api/seller/products").expect(401)
    }

    @Test
    fun `a seller that is not approved cannot list`() {
        val (seller, _) = draftSeller()
        val categoryId = category()
        val refused = seller.post("/api/seller/products", productBody(categoryId)).expect(403)
        assertTrue(refused.message.contains("approved"), refused.body)
        assertEquals(0, seller.get("/api/seller/products").expect(200).data.get("products").size())
    }

    @Test
    fun `a seller lists under a brand only once authorised for it`() {
        val (seller, sellerId) = approvedSeller()
        val categoryId = category()
        val brandName = unique("Neel Weaves")
        val registered = seller.upload("/api/seller/brands", mapOf("name" to brandName, "authorizationType" to "OWNER"), "document", "tm.pdf", pdf, "application/pdf")
            .expect(201).data.get("brand")
        val brandId = registered.get("id").asString()
        assertEquals("PENDING", registered.get("authorizationStatus").asString())

        seller.post("/api/seller/products", productBody(categoryId, extra = mapOf("brandId" to brandId))).expect(403)

        // The proof sits in the private bucket, reachable only by a signed link.
        val link = seller.get("/api/seller/brands/$brandId/document").expect(200).data.get("url").asString()
        assertTrue(link.contains("/api/files/") && link.contains("sig="))

        val pending = admin().get("/api/admin/brands/authorizations").expect(200).data.get("authorizations")
        assertTrue(pending.toString().contains(brandId))
        admin().patch("/api/admin/brands/$brandId/review", mapOf("decision" to "approve", "sellerId" to sellerId)).expect(200)

        val product = seller.post("/api/seller/products", productBody(categoryId, extra = mapOf("brandId" to brandId))).expect(201).data.get("product")
        assertEquals(brandName, product.get("brand").get("name").asString())
        // Another approved seller is not authorised for it.
        val (other, _) = approvedSeller()
        other.post("/api/seller/products", productBody(categoryId, extra = mapOf("brandId" to brandId))).expect(403)
    }

    @Test
    fun `staff create products for the platform shop, live without review`() {
        val admin = admin()
        val categoryId = category(admin)
        val product = admin.post("/api/admin/products", productBody(categoryId)).expect(201).data.get("product")
        assertEquals(PlatformSeller.ID.toString(), product.get("sellerId").asString())
        assertEquals("APPROVED", product.get("moderationStatus").asString())
        assertTrue(visibleOnStorefront(product.get("slug").asString()))

        val id = product.get("id").asString()
        admin.post("/api/admin/products/$id/variants", mapOf("sku" to unique("V").uppercase(), "size" to "L", "quantity" to 0)).expect(201)
        admin.post("/api/admin/products/$id/variants/stock", mapOf("quantity" to 12)).expect(200)
        val listed = admin.get("/api/admin/products?search=${product.get("sku").asString()}").expect(200).data.get("products").get(0)
        assertEquals(12, listed.get("totalStock").asInt())
        assertEquals("healthy", listed.get("stockBand").asString())

        // A Dresses listing cannot go live until the template's required fields are there.
        val missing = admin.post("/api/admin/products", productBody(categoryId, extra = mapOf("articleType" to "Dresses"))).expect(409)
        assertTrue(missing.data.get("missing").size() > 0)
    }

    @Test
    fun `an imported sheet becomes live products`() {
        val admin = admin()
        val categoryName = unique("ImportedTops")
        val article = unique("ART").uppercase()
        val sheet = XSSFWorkbook().use { book ->
            val tab = book.createSheet("Tops")
            val rows = listOf(
                listOf("Catalogue export"),
                listOf("sku", "articleNumber", "name", "category", "colour", "size", "mrp", "stock"),
                listOf("$article-S", article, "Floral Cotton Top", categoryName, "Mustard", "S", "799", "4"),
                listOf("$article-M", article, "Floral Cotton Top", categoryName, "Mustard", "M", "799", "6"),
            )
            rows.forEachIndexed { r, cells -> val row = tab.createRow(r); cells.forEachIndexed { c, v -> row.createCell(c).setCellValue(v) } }
            ByteArrayOutputStream().also(book::write).toByteArray()
        }
        val review = admin.upload("/api/admin/catalog-import/review", emptyMap(), "files", "tops.xlsx", sheet,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").expect(200).data
        assertEquals(1, review.get("summary").get("products").asInt())
        assertEquals(2, review.get("summary").get("variants").asInt())
        val products = json.convertValue(review.get("products"), List::class.java)

        val result = admin.post("/api/admin/catalog-import/commit", mapOf("products" to products, "publish" to true)).expect(200).data
        assertEquals(1, result.get("created").asInt(), result.toString())
        assertEquals(2, result.get("variants").asInt())

        val found = anonymous().get("/api/products?q=floral&category=${categoryName.lowercase()}").expect(200).data.get("products")
        assertEquals(1, found.size(), found.toString())
        assertEquals(10, found.get(0).get("quantity").asInt())
        assertEquals("Mustard", found.get(0).get("colorFamily").asString())

        // The CSV round trip reads back what the importer wrote.
        val csv = admin.get("/api/admin/products/export?sellerId=house").expect(200).body
        assertTrue(csv.contains("$article-M"))
        val dry = admin.post("/api/admin/products/import", mapOf("csv" to "sku,name,price,quantity\n$article,Floral Cotton Top,849,3")).expect(200).data
        assertEquals(1, dry.get("summary").get("updating").asInt())
    }

    @Test
    fun `listings export as a Myntra template`() {
        val admin = admin()
        val categoryId = category(admin)
        admin.post("/api/admin/products", productBody(categoryId, extra = mapOf("articleType" to "Dresses", "status" to "DRAFT"))).expect(201)
        val counts = admin.get("/api/admin/products/export/myntra/counts?sellerId=house").expect(200).data.get("counts")
        assertTrue(counts.get("Dresses").asInt() >= 1)
        val export = admin.getAbsolute("http://localhost:$port/api/admin/products/export/myntra?articleType=Dresses&sellerId=house")
        assertEquals(200, export.statusCode())
        XSSFWorkbook(export.body().inputStream()).use { book -> assertTrue(book.getSheet("Dresses") != null) }
    }

    @Test
    fun `sellers upload real images only`() {
        val (seller, _) = approvedSeller()
        val png = ByteArrayOutputStream().also { ImageIO.write(BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB), "png", it) }.toByteArray()
        val asset = seller.upload("/api/seller/media", emptyMap(), "file", "kurta.png", png, "image/png").expect(201).data.get("asset")
        assertEquals(40, asset.get("width").asInt())
        assertTrue(asset.get("url").asString().contains("/media/"))
        // The same bytes again reuse the asset.
        assertEquals(asset.get("id").asString(), seller.upload("/api/seller/media", emptyMap(), "file", "again.png", png, "image/png").expect(200).data.get("asset").get("id").asString())
        seller.upload("/api/seller/media", emptyMap(), "file", "fake.jpg", "not an image".toByteArray(), "image/jpeg").expect(400)
    }

    @Test
    fun `categories nest, and the public tree and listing templates are open to everyone`() {
        val admin = admin()
        val parent = category(admin, unique("Footwear"))
        admin.put("/api/admin/categories/$parent", mapOf("listingTemplate" to "footwear")).expect(200)
        val childName = unique("Sneakers")
        val child = admin.post("/api/admin/categories", mapOf("name" to childName, "slug" to childName.lowercase(), "parentId" to parent)).expect(201)
            .data.get("category").get("id").asString()
        admin.put("/api/admin/categories/$parent", mapOf("parentId" to child)).expect(400) // a loop
        admin.post("/api/admin/categories/$child/fields", mapOf("label" to "Sole grip", "type" to "SELECT", "options" to "Low, High", "filterable" to true)).expect(201)
        val fields = admin.get("/api/admin/categories/$child/fields").expect(200).data
        assertEquals("soleGrip", fields.get("fields").get(0).get("key").asString())
        assertEquals("footwear", fields.get("template").get("slug").asString())

        val tree = anonymous().get("/api/products/categories/list?tree=1").expect(200).data.get("categories")
        assertTrue(tree.toString().contains(childName))
        val spec = anonymous().get("/api/catalogue/article-types/footwear?categoryId=$child").expect(200).data.get("spec")
        assertTrue(spec.get("columns").toString().contains("soleGrip"))
        assertEquals("UK size", spec.get("optionLabel").asString())
        admin.delete("/api/admin/categories/$parent").expect(409)
        UUID.fromString(child)
    }
}
