package com.tailorae.commerce

import com.tailorae.common.Ids
import com.tailorae.support.IntegrationTest
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Bag, wishlist, addresses, coupons, reviews and delivery, against real Postgres. */
class CommerceIntegrationTest : IntegrationTest() {

    private val platformSeller = UUID.fromString("01900000-0000-7000-8000-000000000001")

    /** A listed product owned by the platform shop, with stock and one quantity break. */
    private fun product(pricePaise: Long = 99_900, stock: Int = 5, approved: Boolean = true): Pair<UUID, UUID> {
        val category = Ids.newId()
        jdbc.sql("insert into category (id, name, slug) values (:id, :n, :s)")
            .param("id", category).param("n", unique("Shirts")).param("s", unique("shirts")).update()
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into product (id, seller_id, category_id, name, slug, sku, price_paise, mrp_paise, quantity, status, moderation_status)
            values (:id, :s, :c, 'Linen Shirt', :slug, :sku, :price, :mrp, :q, 'ACTIVE', :mod)
            """.trimIndent(),
        ).param("id", id).param("s", platformSeller).param("c", category).param("slug", unique("linen-shirt"))
            .param("sku", unique("SKU")).param("price", pricePaise).param("mrp", pricePaise + 20_000).param("q", stock)
            .param("mod", if (approved) "APPROVED" else "PENDING").update()
        jdbc.sql("insert into bulk_pricing (id, product_id, min_qty, price_paise) values (:id, :p, 3, 89900)")
            .param("id", Ids.newId()).param("p", id).update()
        return id to category
    }

    @Test
    fun `a shopper fills the bag, prices follow stock and quantity rules`() {
        val (shirt, _) = product()
        val shopper = customer()

        val cart = shopper.post("/api/cart/items", mapOf("productId" to shirt, "quantity" to 2)).expect(201).data.get("cart")
        assertEquals(199_800, cart.get("subtotalPaise").asLong())
        val itemId = cart.get("items").get(0).get("id").asString()

        // Adding the same product again merges into one line.
        assertEquals(1, shopper.post("/api/cart/items", mapOf("productId" to shirt, "quantity" to 1)).expect(201).data.get("cart").get("items").size())
        shopper.patch("/api/cart/items/$itemId", mapOf("quantity" to 9)).expect(400) // only 5 in stock

        // A bulk line gets the quantity break; a plain one does not.
        shopper.delete("/api/cart").expect(200)
        val bulk = shopper.post("/api/cart/items", mapOf("productId" to shirt, "quantity" to 3, "isBulkOrder" to true)).expect(201).data.get("cart")
        assertEquals(3 * 89_900L, bulk.get("subtotalPaise").asLong())

        // Unlisted products cannot be added; other shoppers cannot touch this bag.
        val (pending, _) = product(approved = false)
        shopper.post("/api/cart/items", mapOf("productId" to pending, "quantity" to 1)).expect(400)
        val bulkLine = bulk.get("items").get(0).get("id").asString()
        customer().delete("/api/cart/items/$bulkLine").expect(404)
        anonymous().get("/api/cart").expect(401)
    }

    @Test
    fun `addresses keep exactly one default, and wishlists are private`() {
        val shopper = customer()
        val address = mapOf("fullName" to "Asha Rao", "phone" to "+91 98450 00000", "line1" to "4 MG Road", "city" to "Bengaluru", "state" to "Karnataka", "postalCode" to "560001")
        val first = shopper.post("/api/users/addresses", address).expect(201).data.get("address")
        assertTrue(first.get("isDefault").asBoolean(), "the first address becomes the default")
        val second = shopper.post("/api/users/addresses", address + ("isDefault" to true)).expect(201).data.get("address")
        val list = shopper.get("/api/users/addresses").expect(200).data.get("addresses")
        assertEquals(1, (0 until list.size()).count { list.get(it).get("isDefault").asBoolean() })
        assertEquals(second.get("id"), list.get(0).get("id"))
        customer().put("/api/users/addresses/${first.get("id").asString()}", address).expect(404)

        val (shirt, _) = product()
        assertEquals(1, shopper.post("/api/users/wishlist", mapOf("productId" to shirt)).expect(200).data.get("items").size())
        assertEquals(0, customer().get("/api/users/wishlist").expect(200).data.get("items").size())
    }

    @Test
    fun `staff create a coupon and a shopper applies it to their own bag`() {
        val (shirt, category) = product(pricePaise = 100_000)
        val code = unique("FEST").uppercase().take(30).replace(Regex("[^A-Z0-9-]"), "")
        admin().post("/api/admin/coupons", mapOf(
            "code" to code, "discountType" to "PERCENTAGE", "discountValue" to 1000, "maxDiscountPaise" to 15_000,
            "startsAt" to "2026-01-01T00:00:00Z", "endsAt" to "2030-01-01T00:00:00Z", "applicableCategoryIds" to listOf(category),
        )).expect(201)

        val shopper = customer()
        shopper.post("/api/coupons/apply", mapOf("code" to code)).expect(400) // empty bag
        shopper.post("/api/cart/items", mapOf("productId" to shirt, "quantity" to 2)).expect(201)
        val preview = shopper.post("/api/coupons/apply", mapOf("code" to code.lowercase())).expect(200).data
        assertEquals(15_000, preview.get("discountPaise").asLong()) // 10% of ₹2000, capped at ₹150
        shopper.post("/api/coupons/apply", mapOf("code" to "NOPE")).expect(400)

        customer().post("/api/admin/coupons", mapOf("code" to "X")).expect(401)
    }

    @Test
    fun `reviews update the product rating, and staff can hide one`() {
        val (shirt, _) = product()
        customer().post("/api/products/$shirt/reviews", mapOf("rating" to 5, "comment" to "Beautiful weave")).expect(201)
        val second = customer().post("/api/products/$shirt/reviews", mapOf("rating" to 2)).expect(201).data
        assertEquals(3.5, rating(shirt))

        val page = anonymous().get("/api/products/$shirt/reviews").expect(200).data
        assertEquals(2, page.get("summary").get("count").asInt())

        admin().patch("/api/admin/reviews/${second.get("id").asString()}", mapOf("isPublished" to false)).expect(200)
        assertEquals(5.0, rating(shirt))
        anonymous().post("/api/products/$shirt/reviews", mapOf("rating" to 5)).expect(401)
    }

    @Test
    fun `delivery estimates by zone and validates the pincode`() {
        val eta = anonymous().post("/api/delivery/eta", mapOf("pincode" to "560001")).expect(200).data
        assertEquals(4, eta.get("minDays").asInt())
        assertTrue(eta.get("cod").asBoolean())
        assertTrue(!anonymous().post("/api/delivery/eta", mapOf("pincode" to "800001")).expect(200).data.get("cod").asBoolean())
        anonymous().get("/api/delivery/pincode/12345").expect(400)
    }

    @Test
    fun `the profile can be read and edited`() {
        val shopper = customer()
        assertEquals("Meera", shopper.put("/api/users/profile", mapOf("firstName" to "Meera", "phone" to "+91 90000 00001")).expect(200)
            .data.get("user").get("firstName").asString())
    }

    private fun rating(product: UUID) =
        jdbc.sql("select rating::float8 from product where id = :p").param("p", product).query(Double::class.javaObjectType).single()
}
