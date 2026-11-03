package com.tailorae.b2b

import com.tailorae.common.Ids
import org.springframework.jdbc.core.simple.JdbcClient
import java.util.UUID

/**
 * Catalogue rows for tests in this scope. The catalog module owns these tables;
 * the tests only need a live product to point at, so they insert one directly
 * under the platform's own seller.
 */
object CatalogFixtures {
    private val PLATFORM_SELLER: UUID = UUID.fromString("01900000-0000-7000-8000-000000000001")

    data class Product(val id: UUID, val variantId: UUID, val slug: String, val name: String)

    fun product(jdbc: JdbcClient, tag: String, pricePaise: Long = 50_000, quantity: Int = 0): Product {
        val category = Ids.newId()
        jdbc.sql("insert into category (id, name, slug) values (:id, :n, :s)").param("id", category).param("n", "Cat $tag").param("s", "cat-$tag").update()
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into product (id, seller_id, category_id, name, slug, sku, price_paise, quantity, status, moderation_status, allow_bulk_orders)
            values (:id, :seller, :cat, :name, :slug, :sku, :price, :qty, 'ACTIVE', 'APPROVED', true)
            """.trimIndent(),
        )
            .param("id", id).param("seller", PLATFORM_SELLER).param("cat", category).param("name", "Kurta $tag")
            .param("slug", "kurta-$tag").param("sku", "SKU-$tag").param("price", pricePaise).param("qty", quantity)
            .update()
        val variant = Ids.newId()
        jdbc.sql("insert into product_variant (id, product_id, seller_id, name, sku, size, quantity) values (:id, :p, :s, :n, :sku, 'M', :q)")
            .param("id", variant).param("p", id).param("s", PLATFORM_SELLER).param("n", "Size M").param("sku", "SKU-$tag-M").param("q", quantity)
            .update()
        return Product(id, variant, "kurta-$tag", "Kurta $tag")
    }

    fun bulkTier(jdbc: JdbcClient, productId: UUID, minQty: Int, pricePaise: Long) {
        jdbc.sql("insert into bulk_pricing (id, product_id, min_qty, price_paise) values (:id, :p, :m, :price)")
            .param("id", Ids.newId()).param("p", productId).param("m", minQty).param("price", pricePaise).update()
    }
}
