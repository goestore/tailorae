package com.tailorae.catalog

import com.tailorae.catalog.rules.ProductColors
import com.tailorae.catalog.rules.ProductLike
import com.tailorae.catalog.rules.VariantLike
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Turns product rows into what the web app reads: the row's own fields (as the
 * legacy API returned them, money in paise), plus its category, brand and shop,
 * the effective stock and the colour cards the grid renders one tile each.
 */
@Component
class ProductViews(private val jdbc: JdbcClient, private val repo: ProductRepository) {

    /** Listing rows: no variants, no private fields, one colour card per colour. */
    fun cards(products: List<MutableMap<String, Any?>>): List<Map<String, Any?>> {
        if (products.isEmpty()) return emptyList()
        val variants = repo.variantsFor(products.map { UUID.fromString(it["id"] as String) })
        val refs = references(products)
        return products.map { p ->
            val vs = variants[p["id"]] ?: emptyList()
            val out = LinkedHashMap(p)
            ProductColumns.PRIVATE.forEach(out::remove)
            out.remove("moderationStatus")
            decorate(out, refs)
            out["quantity"] = ProductColors.effectiveStock((p["quantity"] as Int?) ?: 0, vs.map { (it["quantity"] as Int?) ?: 0 })
            out["colors"] = ProductColors.cards(productLike(p), vs.map(::variantLike))
            out
        }
    }

    /**
     * One product with its sizes, personalisation options and bulk tiers.
     * [includePrivate] is the owning seller's and staff's view (cost price,
     * moderation note); shoppers never get those.
     */
    fun detail(product: MutableMap<String, Any?>, includePrivate: Boolean): MutableMap<String, Any?> {
        val id = UUID.fromString(product["id"] as String)
        val variants = repo.variants(id)
        val out = LinkedHashMap(product)
        if (!includePrivate) {
            ProductColumns.PRIVATE.forEach(out::remove)
            out.remove("moderationStatus")
        }
        decorate(out, references(listOf(product)))
        out["variants"] = variants
        out["customizations"] = repo.customizations(id)
        out["bulkPricings"] = repo.bulkPricings(id)
        out["quantity"] = ProductColors.effectiveStock((product["quantity"] as Int?) ?: 0, variants.map { (it["quantity"] as Int?) ?: 0 })
        out["colors"] = ProductColors.details(productLike(product), variants.map(::variantLike))
        return out
    }

    fun discountPercentage(product: Map<String, Any?>): Int {
        val price = (product["pricePaise"] as Number?)?.toLong() ?: 0
        val mrp = (product["mrpPaise"] as Number?)?.toLong() ?: 0
        return if (mrp > price && price > 0) Math.round((mrp - price) * 100.0 / mrp).toInt() else 0
    }

    private data class Refs(
        val categories: Map<String, Map<String, Any?>>,
        val brands: Map<String, Map<String, Any?>>,
        val sellers: Map<String, Map<String, Any?>>,
    )

    private fun decorate(out: MutableMap<String, Any?>, refs: Refs) {
        out["discountPercentage"] = discountPercentage(out)
        out["category"] = (out["categoryId"] as String?)?.let { refs.categories[it] }
        out["brand"] = (out["brandId"] as String?)?.let { refs.brands[it] }
        out["seller"] = (out["sellerId"] as String?)?.let { refs.sellers[it] }
    }

    private fun references(products: List<Map<String, Any?>>): Refs {
        fun ids(key: String) = products.mapNotNull { it[key] as String? }.distinct().map(UUID::fromString)
        val categoryIds = ids("categoryId")
        val brandIds = ids("brandId")
        val sellerIds = ids("sellerId")
        val categories = if (categoryIds.isEmpty()) emptyMap() else
            jdbc.sql("select id, name, slug from category where id in (:ids)").param("ids", categoryIds)
                .query { rs, _ -> rs.getString("id") to mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug")) }
                .list().toMap()
        val brands = if (brandIds.isEmpty()) emptyMap() else
            jdbc.sql("select id, name, slug, logo, description from brand where id in (:ids)").param("ids", brandIds)
                .query { rs, _ ->
                    rs.getString("id") to mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug"),
                        "logo" to rs.getString("logo"), "description" to rs.getString("description"))
                }.list().toMap()
        // Inside a seller scope only the caller's own shop row is visible, which is the only one its products name.
        val sellers = if (sellerIds.isEmpty()) emptyMap() else
            jdbc.sql("select id, shop_name, shop_slug, shop_image, status, is_platform, rating, rating_count from seller where id in (:ids)")
                .param("ids", sellerIds)
                .query { rs, _ ->
                    rs.getString("id") to mapOf(
                        "id" to rs.getString("id"), "shopName" to rs.getString("shop_name"), "shopSlug" to rs.getString("shop_slug"),
                        "shopImage" to rs.getString("shop_image"), "isVerified" to (rs.getString("status") == "APPROVED"),
                        "isPlatform" to rs.getBoolean("is_platform"), "rating" to (rs.getBigDecimal("rating")?.toDouble() ?: 0.0),
                        "ratingCount" to rs.getInt("rating_count"),
                    )
                }.list().toMap()
        return Refs(categories, brands, sellers)
    }

    @Suppress("UNCHECKED_CAST")
    private fun productLike(p: Map<String, Any?>) = ProductLike(
        thumbnail = p["thumbnail"] as String?, images = (p["images"] as List<String>?) ?: emptyList(), color = p["color"] as String?,
        quantity = (p["quantity"] as Int?) ?: 0, colourHexes = p["colourHexes"] as Map<String, Any?>?, colorFamily = p["colorFamily"] as String?,
    )

    @Suppress("UNCHECKED_CAST")
    private fun variantLike(v: Map<String, Any?>) = VariantLike(
        id = v["id"] as String, color = v["color"] as String?, size = v["size"] as String?, sku = v["sku"] as String,
        quantity = (v["quantity"] as Int?) ?: 0, images = (v["images"] as List<String>?) ?: emptyList(),
        isDefault = (v["isDefault"] as Boolean?) ?: false, colorFamily = v["colorFamily"] as String?,
    )
}
