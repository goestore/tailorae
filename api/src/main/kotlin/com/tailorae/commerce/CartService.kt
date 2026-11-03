package com.tailorae.commerce

import com.tailorae.common.BadRequestException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * One cart line, priced now. Prices are never stored on the cart: a line is
 * repriced on every read, so the basket always shows what checkout will charge.
 */
data class PricedLine(
    val id: UUID,
    val productId: UUID,
    val variantId: UUID?,
    val sellerId: UUID,
    val categoryId: UUID,
    val name: String,
    val slug: String,
    val sku: String,
    val thumbnail: String?,
    val size: String?,
    val color: String?,
    val unitPaise: Long,
    val mrpPaise: Long?,
    val quantity: Int,
    val customization: Map<String, Any?>?,
    val mockupImage: String?,
    val isBulkOrder: Boolean,
    /** Units on hand for this product/variant right now. */
    val stock: Int,
    /** Listed, approved, and its seller is approved. */
    val available: Boolean,
) {
    val lineTotalPaise: Long get() = unitPaise * quantity
}

data class CartView(
    val id: UUID,
    val items: List<CartItemView>,
    val subtotalPaise: Long,
    val itemCount: Int,
    /** Lines that cannot be bought as they stand (sold out, delisted, over stock). */
    val problems: List<String>,
)

data class CartItemView(
    val id: UUID,
    val productId: UUID,
    val variantId: UUID?,
    val quantity: Int,
    val unitPaise: Long,
    val lineTotalPaise: Long,
    val customization: Map<String, Any?>?,
    val mockupImage: String?,
    val available: Boolean,
    val product: Map<String, Any?>,
    val variant: Map<String, Any?>?,
)

data class AddToCartRequest(
    val productId: UUID,
    val variantId: UUID? = null,
    val quantity: Int = 1,
    val customization: Map<String, Any?>? = null,
    val mockupImage: String? = null,
    val isBulkOrder: Boolean = false,
)

@Service
class CartService(private val jdbc: JdbcClient, private val json: JsonMapper) {

    @Transactional(readOnly = true)
    fun view(customerId: UUID): CartView = shape(customerId, lines(customerId))

    @Transactional
    fun add(customerId: UUID, req: AddToCartRequest): CartView {
        if (req.quantity < 1) throw BadRequestException("quantity must be an integer of at least 1")
        val product = jdbc.sql(
            """
            select p.id, p.status, p.moderation_status, p.quantity, p.min_order_quantity, p.max_order_quantity, s.status as seller_status
            from product p join seller s on s.id = p.seller_id where p.id = :id
            """.trimIndent(),
        ).param("id", req.productId).query { rs, _ ->
            ProductRow(rs.getString("status"), rs.getString("moderation_status"), rs.getString("seller_status"),
                rs.getInt("quantity"), rs.getInt("min_order_quantity"), rs.getObject("max_order_quantity") as Int?)
        }.optional().orElseThrow { NotFoundException("Product not found") }
        if (product.status != "ACTIVE" || product.moderation != "APPROVED" || product.sellerStatus != "APPROVED") {
            throw BadRequestException("Product is not available")
        }
        val variantStock = req.variantId?.let { vid ->
            jdbc.sql("select quantity from product_variant where id = :v and product_id = :p")
                .param("v", vid).param("p", req.productId).query(Int::class.javaObjectType).optional()
                .orElseThrow { BadRequestException("Variant not found for this product") }
        }
        val hasVariants = jdbc.sql("select exists (select 1 from product_variant where product_id = :p)")
            .param("p", req.productId).query(Boolean::class.javaObjectType).single()
        if (hasVariants && req.variantId == null) throw BadRequestException("Choose a size or option first")
        val stock = variantStock ?: product.quantity

        val existing = if (req.customization == null) {
            jdbc.sql(
                "select id, quantity from cart_item where customer_id = :c and product_id = :p and variant_id is not distinct from :v and customization is null",
            ).param("c", customerId).param("p", req.productId).param("v", req.variantId)
                .query { rs, _ -> rs.getObject("id", UUID::class.java) to rs.getInt("quantity") }.optional().orElse(null)
        } else {
            null
        }
        val total = req.quantity + (existing?.second ?: 0)
        if (total > stock) throw BadRequestException("Insufficient stock for the requested quantity")
        product.max?.let { if (total > it && !req.isBulkOrder) throw BadRequestException("You can buy at most $it of this item") }

        if (existing != null) {
            jdbc.sql("update cart_item set quantity = :q, updated_at = now() where id = :id").param("q", total).param("id", existing.first).update()
        } else {
            jdbc.sql(
                """
                insert into cart_item (id, customer_id, product_id, variant_id, quantity, customization, mockup_image, is_bulk_order)
                values (:id, :c, :p, :v, :q, cast(:custom as jsonb), :mockup, :bulk)
                """.trimIndent(),
            )
                .param("id", Ids.newId()).param("c", customerId).param("p", req.productId).param("v", req.variantId)
                .param("q", req.quantity).param("custom", req.customization?.let(json::writeValueAsString))
                .param("mockup", req.mockupImage).param("bulk", req.isBulkOrder)
                .update()
        }
        return view(customerId)
    }

    /** Quantity 0 removes the line. */
    @Transactional
    fun update(customerId: UUID, itemId: UUID, quantity: Int): CartView {
        if (quantity < 0) throw BadRequestException("quantity must be an integer of 0 or more")
        val line = lines(customerId).firstOrNull { it.id == itemId } ?: throw NotFoundException("Cart item not found")
        if (quantity == 0) return remove(customerId, itemId)
        if (quantity > line.stock) throw BadRequestException("Insufficient stock for the requested quantity")
        jdbc.sql("update cart_item set quantity = :q, updated_at = now() where id = :id and customer_id = :c")
            .param("q", quantity).param("id", itemId).param("c", customerId).update()
        return view(customerId)
    }

    @Transactional
    fun remove(customerId: UUID, itemId: UUID): CartView {
        val n = jdbc.sql("delete from cart_item where id = :id and customer_id = :c").param("id", itemId).param("c", customerId).update()
        if (n == 0) throw NotFoundException("Cart item not found")
        return view(customerId)
    }

    @Transactional
    fun clear(customerId: UUID): CartView {
        jdbc.sql("delete from cart_item where customer_id = :c").param("c", customerId).update()
        return view(customerId)
    }

    /** The basket, priced now — what checkout charges. */
    @Transactional(readOnly = true)
    fun lines(customerId: UUID): List<PricedLine> {
        val rows = jdbc.sql(
            """
            select ci.id, ci.product_id, ci.variant_id, ci.quantity, ci.customization::text as customization,
                   ci.mockup_image, ci.is_bulk_order,
                   p.seller_id, p.category_id, p.name, p.slug, p.thumbnail, p.price_paise, p.mrp_paise, p.sku,
                   p.quantity as product_stock, p.allow_bulk_orders, p.status, p.moderation_status,
                   s.status as seller_status,
                   v.sku as variant_sku, v.size, v.color, v.price_paise as variant_price, v.quantity as variant_stock
            from cart_item ci
            join product p on p.id = ci.product_id
            join seller s on s.id = p.seller_id
            left join product_variant v on v.id = ci.variant_id
            where ci.customer_id = :c
            order by ci.created_at
            """.trimIndent(),
        ).param("c", customerId).query { rs, _ ->
            val custom = rs.getString("customization")?.let { json.readValue(it, Map::class.java) as Map<String, Any?> }
            LineRow(
                id = rs.getObject("id", UUID::class.java),
                productId = rs.getObject("product_id", UUID::class.java),
                variantId = rs.getObject("variant_id", UUID::class.java),
                quantity = rs.getInt("quantity"),
                customization = custom,
                mockup = rs.getString("mockup_image"),
                bulk = rs.getBoolean("is_bulk_order"),
                sellerId = rs.getObject("seller_id", UUID::class.java),
                categoryId = rs.getObject("category_id", UUID::class.java),
                name = rs.getString("name"),
                slug = rs.getString("slug"),
                thumbnail = rs.getString("thumbnail"),
                pricePaise = rs.getLong("price_paise"),
                mrpPaise = rs.getObject("mrp_paise") as Long?,
                sku = rs.getString("variant_sku") ?: rs.getString("sku"),
                stock = if (rs.getObject("variant_id") != null) rs.getInt("variant_stock") else rs.getInt("product_stock"),
                bulkAllowed = rs.getBoolean("allow_bulk_orders"),
                available = rs.getString("status") == "ACTIVE" && rs.getString("moderation_status") == "APPROVED" && rs.getString("seller_status") == "APPROVED",
                size = rs.getString("size"),
                color = rs.getString("color"),
                variantPrice = rs.getObject("variant_price") as Long?,
            )
        }.list()
        if (rows.isEmpty()) return emptyList()

        val productIds = rows.map { it.productId }.distinct()
        val tiers = jdbc.sql("select product_id, min_qty, max_qty, price_paise from bulk_pricing where product_id = any(:ids)")
            .param("ids", productIds.toTypedArray())
            .query { rs, _ -> rs.getObject("product_id", UUID::class.java) to BulkTier(rs.getInt("min_qty"), rs.getObject("max_qty") as Int?, rs.getLong("price_paise")) }
            .list().groupBy({ it.first }, { it.second })
        val options = jdbc.sql("select id, product_id, name, additional_paise from product_customization where product_id = any(:ids)")
            .param("ids", productIds.toTypedArray())
            .query { rs, _ -> rs.getObject("product_id", UUID::class.java) to Triple(rs.getObject("id", UUID::class.java).toString(), rs.getString("name"), rs.getLong("additional_paise")) }
            .list().groupBy({ it.first }, { it.second })

        return rows.map { r ->
            // An add-on is charged when the customisation names its option by id or by name.
            val chosen = r.customization?.keys.orEmpty()
            val addOns = options[r.productId].orEmpty().filter { (id, name, _) -> id in chosen || name in chosen }.sumOf { it.third }
            PricedLine(
                id = r.id, productId = r.productId, variantId = r.variantId, sellerId = r.sellerId, categoryId = r.categoryId,
                name = r.name, slug = r.slug, sku = r.sku, thumbnail = r.thumbnail, size = r.size, color = r.color,
                unitPaise = UnitPricing.unitPrice(r.pricePaise, r.variantPrice, r.quantity, tiers[r.productId].orEmpty(), r.bulkAllowed && r.bulk, addOns),
                mrpPaise = r.mrpPaise, quantity = r.quantity, customization = r.customization, mockupImage = r.mockup,
                isBulkOrder = r.bulk, stock = r.stock, available = r.available,
            )
        }
    }

    private fun shape(customerId: UUID, lines: List<PricedLine>): CartView {
        val problems = lines.mapNotNull { l ->
            when {
                !l.available -> "${l.name} is no longer available"
                l.stock == 0 -> "${l.name} is sold out"
                l.quantity > l.stock -> "Only ${l.stock} of ${l.name} left"
                else -> null
            }
        }
        return CartView(
            id = customerId,
            items = lines.map { l ->
                CartItemView(
                    id = l.id, productId = l.productId, variantId = l.variantId, quantity = l.quantity,
                    unitPaise = l.unitPaise, lineTotalPaise = l.lineTotalPaise, customization = l.customization,
                    mockupImage = l.mockupImage, available = l.available && l.quantity <= l.stock,
                    product = mapOf("id" to l.productId, "name" to l.name, "slug" to l.slug, "thumbnail" to l.thumbnail,
                        "pricePaise" to l.unitPaise, "mrpPaise" to l.mrpPaise, "quantity" to l.stock),
                    variant = l.variantId?.let { mapOf("id" to it, "size" to l.size, "color" to l.color, "sku" to l.sku) },
                )
            },
            subtotalPaise = lines.sumOf { it.lineTotalPaise },
            itemCount = lines.sumOf { it.quantity },
            problems = problems,
        )
    }

    private data class ProductRow(val status: String, val moderation: String, val sellerStatus: String, val quantity: Int, val min: Int, val max: Int?)

    private data class LineRow(
        val id: UUID, val productId: UUID, val variantId: UUID?, val quantity: Int, val customization: Map<String, Any?>?,
        val mockup: String?, val bulk: Boolean, val sellerId: UUID, val categoryId: UUID, val name: String, val slug: String,
        val thumbnail: String?, val pricePaise: Long, val mrpPaise: Long?, val sku: String, val stock: Int, val bulkAllowed: Boolean,
        val available: Boolean, val size: String?, val color: String?, val variantPrice: Long?,
    )
}
