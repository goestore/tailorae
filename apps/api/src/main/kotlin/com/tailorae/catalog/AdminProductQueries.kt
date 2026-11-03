package com.tailorae.catalog

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/** Staff reads over the whole catalogue: the product table, its health summary, and inventory. */
@Service
class AdminProductQueries(private val jdbc: JdbcClient, private val repo: ProductRepository, private val views: ProductViews) {

    /** Stock bands, shared by the filter, the row chip and the chart so they never disagree about "low". */
    private val stockSql = """
        (case when not exists (select 1 from product_variant v where v.product_id = p.id) then
            case when p.quantity <= 0 then 'out' when p.quantity <= $LOW_STOCK_LIMIT then 'low' else 'healthy' end
         when not exists (select 1 from product_variant v where v.product_id = p.id and v.quantity > 0) then 'out'
         when exists (select 1 from product_variant v where v.product_id = p.id and v.quantity > 0 and v.quantity <= $LOW_STOCK_LIMIT) then 'low'
         else 'healthy' end)
    """.trimIndent()

    private val totalStockSql = "(case when exists (select 1 from product_variant v where v.product_id = p.id) " +
        "then (select coalesce(sum(v.quantity), 0) from product_variant v where v.product_id = p.id) else p.quantity end)"

    private val sorts = mapOf(
        "newest" to "p.created_at desc", "oldest" to "p.created_at", "name" to "p.name", "price-asc" to "p.price_paise",
        "price-desc" to "p.price_paise desc", "stock-asc" to "$totalStockSql", "updated" to "p.updated_at desc",
    )

    @Transactional(readOnly = true)
    fun list(params: Map<String, String>, page: Int, limit: Int): Triple<List<Map<String, Any?>>, Long, Pair<Int, Int>> {
        val clauses = mutableListOf("true")
        val bind = linkedMapOf<String, Any?>()
        fun text(k: String) = params[k]?.trim()?.takeIf { it.isNotEmpty() }
        text("search")?.let {
            clauses += "(p.name ilike :search or p.sku ilike :search or p.slug ilike :search or exists (select 1 from product_variant v where v.product_id = p.id and v.sku ilike :search))"
            bind["search"] = "%$it%"
        }
        text("status")?.takeIf { it in ProductColumns.STATUSES }?.let { clauses += "p.status = :status"; bind["status"] = it }
        text("categoryId")?.let { id -> runCatching { UUID.fromString(id) }.getOrNull()?.let { clauses += "p.category_id = :category"; bind["category"] = it } }
        text("stock")?.takeIf { it in setOf("healthy", "low", "out") }?.let { clauses += "$stockSql = :stock"; bind["stock"] = it }
        text("moderation")?.takeIf { it in setOf("PENDING", "APPROVED", "REJECTED") }?.let { clauses += "p.moderation_status = :moderation"; bind["moderation"] = it }
        (text("sellerId") ?: text("vendorId"))?.let { v ->
            val id = if (v == "house") PlatformSeller.ID else runCatching { UUID.fromString(v) }.getOrNull()
            if (id != null) { clauses += "p.seller_id = :seller"; bind["seller"] = id } else clauses += "false"
        }
        if (text("featured") == "true") clauses += "p.is_featured"
        if (text("images") == "missing") clauses += "p.thumbnail is null and cardinality(p.images) = 0"
        val where = clauses.joinToString(" and ")
        val safeLimit = limit.coerceIn(1, 100)
        val safePage = page.coerceAtLeast(1)
        val total = jdbc.sql("select count(*) from product p where $where").params(bind).query(Long::class.javaObjectType).single()
        val order = sorts[text("sort") ?: "newest"] ?: sorts.getValue("newest")
        val rows = jdbc.sql("select p.*, $stockSql as stock_band, $totalStockSql as total_stock from product p where $where order by $order, p.id limit :l offset :o")
            .params(bind + mapOf("l" to safeLimit, "o" to (safePage - 1) * safeLimit))
            .query { rs, _ -> repo.productRow(rs).apply { put("stockBand", rs.getString("stock_band")); put("totalStock", rs.getInt("total_stock")) } }.list()
        val variants = repo.variantsFor(rows.map { UUID.fromString(it["id"] as String) })
        val decorated = views.cards(rows).mapIndexed { i, card ->
            card + mapOf(
                "costPaise" to rows[i]["costPaise"], "moderationStatus" to rows[i]["moderationStatus"], "moderationNote" to rows[i]["moderationNote"],
                "stockBand" to rows[i]["stockBand"], "totalStock" to rows[i]["totalStock"],
                "variants" to (variants[rows[i]["id"]] ?: emptyList()).map { v ->
                    mapOf("id" to v["id"], "name" to v["name"], "sku" to v["sku"], "size" to v["size"], "color" to v["color"], "quantity" to v["quantity"], "pricePaise" to v["pricePaise"])
                },
            )
        }
        return Triple(decorated, total, safePage to safeLimit)
    }

    @Transactional(readOnly = true)
    fun summary(): Map<String, Any?> {
        val statuses = jdbc.sql("select status, count(*) from product group by status").query { rs, _ -> rs.getString(1) to rs.getLong(2) }.list().toMap()
        val bands = jdbc.sql(
            """
            select c.id, c.name, $stockSql as band, count(*) as n, sum($totalStockSql) as units
            from product p join category c on c.id = p.category_id where p.status <> 'DISCONTINUED' group by c.id, c.name, band
            """.trimIndent(),
        ).query { rs, _ -> listOf(rs.getString(1), rs.getString(2), rs.getString(3), rs.getLong(4), rs.getLong(5)) }.list()
        val stock = linkedMapOf("healthy" to 0L, "low" to 0L, "out" to 0L)
        val categories = linkedMapOf<String, MutableMap<String, Any?>>()
        for ((id, name, band, n, units) in bands.map { Quint(it[0] as String, it[1] as String, it[2] as String, it[3] as Long, it[4] as Long) }) {
            stock[band] = stock.getValue(band) + n
            val entry = categories.getOrPut(id) { linkedMapOf("categoryId" to id, "category" to name, "healthy" to 0L, "low" to 0L, "out" to 0L, "units" to 0L) }
            entry[band] = (entry[band] as Long) + n
            entry["units"] = (entry["units"] as Long) + units
        }
        fun count(sql: String) = jdbc.sql(sql).query(Long::class.javaObjectType).single()
        return linkedMapOf(
            "total" to statuses.values.sum(), "statuses" to statuses, "stock" to stock, "lowStockLimit" to LOW_STOCK_LIMIT,
            "pendingReview" to count("select count(*) from product where moderation_status = 'PENDING'"),
            "featured" to count("select count(*) from product where is_featured"),
            "missingImages" to count("select count(*) from product where status = 'ACTIVE' and thumbnail is null and cardinality(images) = 0"),
            "categories" to categories.values.sortedByDescending { (it["low"] as Long) + (it["out"] as Long) },
        )
    }

    private data class Quint(val a: String, val b: String, val c: String, val d: Long, val e: Long)

    @Transactional(readOnly = true)
    fun inventory(): List<Map<String, Any?>> =
        jdbc.sql("select p.id, p.name, p.sku, p.status, p.updated_at, s.shop_name, $totalStockSql as stock from product p join seller s on s.id = p.seller_id order by stock, p.name limit 1000")
            .query { rs, _ ->
                mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "sku" to rs.getString("sku"), "quantity" to rs.getInt("stock"),
                    "status" to rs.getString("status"), "seller" to mapOf("shopName" to rs.getString("shop_name")), "updatedAt" to rs.getTimestamp("updated_at").toInstant())
            }.list()

    @Transactional(readOnly = true)
    fun movements(productId: UUID?, limit: Int): List<Map<String, Any?>> =
        jdbc.sql(
            """
            select m.*, p.name as product_name, v.sku as variant_sku from inventory_movement m
            join product p on p.id = m.product_id left join product_variant v on v.id = m.variant_id
            ${if (productId != null) "where m.product_id = :p" else ""} order by m.created_at desc limit :l
            """.trimIndent(),
        ).apply { if (productId != null) param("p", productId) }.param("l", limit.coerceIn(1, 500)).query { rs, _ ->
            mapOf("id" to rs.getString("id"), "productId" to rs.getString("product_id"), "productName" to rs.getString("product_name"),
                "variantId" to rs.getString("variant_id"), "variantSku" to rs.getString("variant_sku"), "delta" to rs.getInt("delta"),
                "reason" to rs.getString("reason"), "reference" to rs.getString("reference"), "note" to rs.getString("note"),
                "createdAt" to rs.getTimestamp("created_at").toInstant())
        }.list()

    companion object {
        const val LOW_STOCK_LIMIT = 10
    }
}
