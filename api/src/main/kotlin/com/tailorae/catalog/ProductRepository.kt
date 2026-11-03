package com.tailorae.catalog

import com.tailorae.common.Ids
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper
import java.sql.ResultSet
import java.util.UUID

/**
 * Product and variant rows as camelCase maps (the shape the listing rules and
 * the legacy responses use), and the dynamic writes built from
 * [ProductColumns] / [VariantColumns].
 *
 * Nothing here filters by seller: seller-realm callers run inside
 * `SellerScope`, so row-level security limits every statement to their rows,
 * and storefront callers add the visibility clause themselves.
 */
@Component
class ProductRepository(private val jdbc: JdbcClient, private val json: JsonMapper) {

    // ------------------------------------------------------------ reads

    fun product(id: UUID): MutableMap<String, Any?>? =
        jdbc.sql("select * from product where id = :id").param("id", id).query { rs, _ -> productRow(rs) }.optional().orElse(null)

    fun productBySlug(slug: String): MutableMap<String, Any?>? =
        jdbc.sql("select * from product where slug = :s").param("s", slug).query { rs, _ -> productRow(rs) }.optional().orElse(null)

    fun products(ids: Collection<UUID>): List<MutableMap<String, Any?>> =
        if (ids.isEmpty()) emptyList()
        else jdbc.sql("select * from product where id in (:ids)").param("ids", ids).query { rs, _ -> productRow(rs) }.list()

    fun variants(productId: UUID): List<MutableMap<String, Any?>> =
        jdbc.sql("select * from product_variant where product_id = :p order by color nulls first, created_at, sku")
            .param("p", productId).query { rs, _ -> variantRow(rs) }.list()

    fun variantsFor(productIds: Collection<UUID>): Map<String, List<MutableMap<String, Any?>>> =
        if (productIds.isEmpty()) emptyMap()
        else jdbc.sql("select * from product_variant where product_id in (:ids) order by color nulls first, created_at, sku")
            .param("ids", productIds).query { rs, _ -> variantRow(rs) }.list().groupBy { it["productId"] as String }

    fun variant(productId: UUID, variantId: UUID): MutableMap<String, Any?>? =
        jdbc.sql("select * from product_variant where id = :v and product_id = :p").param("v", variantId).param("p", productId)
            .query { rs, _ -> variantRow(rs) }.optional().orElse(null)

    fun customizations(productId: UUID): List<Map<String, Any?>> =
        jdbc.sql("select * from product_customization where product_id = :p order by created_at, name").param("p", productId)
            .query { rs, _ ->
                linkedMapOf<String, Any?>(
                    "id" to rs.getString("id"), "productId" to rs.getString("product_id"), "name" to rs.getString("name"),
                    "type" to rs.getString("type"), "isRequired" to rs.getBoolean("is_required"),
                    "options" to rs.getString("options")?.let { json.readValue(it, Any::class.java) },
                    "additionalPaise" to rs.getLong("additional_paise"), "maxCharacters" to rs.getObject("max_characters") as Int?,
                )
            }.list()

    fun bulkPricings(productId: UUID): List<Map<String, Any?>> =
        jdbc.sql("select * from bulk_pricing where product_id = :p order by min_qty").param("p", productId)
            .query { rs, _ ->
                linkedMapOf<String, Any?>(
                    "id" to rs.getString("id"), "productId" to rs.getString("product_id"), "minQty" to rs.getInt("min_qty"),
                    "maxQty" to rs.getObject("max_qty") as Int?, "discountBp" to rs.getInt("discount_bp"),
                    "pricePaise" to rs.getLong("price_paise"),
                )
            }.list()

    fun slugTaken(slug: String): Boolean =
        jdbc.sql("select product_slug_taken(:s)").param("s", slug).query(Boolean::class.javaObjectType).single()

    // ------------------------------------------------------------ writes

    fun insertProduct(sellerId: UUID, data: Map<String, Any?>): UUID {
        val id = Ids.newId()
        val defs = data.keys.mapNotNull { ProductColumns.BY_NAME[it] }
        val columns = (listOf("id", "seller_id") + defs.map { it.column }).joinToString(", ")
        val values = (listOf(":id", ":sellerId") + defs.map { placeholder(it) }).joinToString(", ")
        var spec = jdbc.sql("insert into product ($columns) values ($values)").param("id", id).param("sellerId", sellerId)
        for (def in defs) spec = spec.param(def.name, bindValue(def, data[def.name]))
        spec.update()
        return id
    }

    fun updateProduct(id: UUID, data: Map<String, Any?>, moderated: Boolean = false) {
        val defs = data.keys.mapNotNull { ProductColumns.BY_NAME[it] }
        if (defs.isEmpty() && !moderated) return
        val sets = (defs.map { "${it.column} = ${placeholder(it)}" } + listOfNotNull("updated_at = now()", if (moderated) "moderated_at = now()" else null))
        var spec = jdbc.sql("update product set ${sets.joinToString(", ")} where id = :id").param("id", id)
        for (def in defs) spec = spec.param(def.name, bindValue(def, data[def.name]))
        spec.update()
    }

    fun insertVariant(productId: UUID, sellerId: UUID, data: Map<String, Any?>): UUID {
        val id = Ids.newId()
        val defs = data.keys.mapNotNull { VariantColumns.BY_NAME[it] }
        val columns = (listOf("id", "product_id", "seller_id") + defs.map { it.column }).joinToString(", ")
        val values = (listOf(":id", ":productId", ":sellerId") + defs.map { placeholder(it) }).joinToString(", ")
        var spec = jdbc.sql("insert into product_variant ($columns) values ($values)")
            .param("id", id).param("productId", productId).param("sellerId", sellerId)
        for (def in defs) spec = spec.param(def.name, bindValue(def, data[def.name]))
        spec.update()
        return id
    }

    fun updateVariant(id: UUID, data: Map<String, Any?>) {
        val defs = data.keys.mapNotNull { VariantColumns.BY_NAME[it] }
        if (defs.isEmpty()) return
        val sets = defs.map { "${it.column} = ${placeholder(it)}" } + "updated_at = now()"
        var spec = jdbc.sql("update product_variant set ${sets.joinToString(", ")} where id = :id").param("id", id)
        for (def in defs) spec = spec.param(def.name, bindValue(def, data[def.name]))
        spec.update()
    }

    fun recordMovement(sellerId: UUID, productId: UUID, variantId: UUID?, delta: Int, reason: String, note: String?, by: UUID?) {
        if (delta == 0) return
        jdbc.sql(
            """
            insert into inventory_movement (id, seller_id, product_id, variant_id, delta, reason, note, created_by)
            values (:id, :s, :p, :v, :d, :r, :n, :by)
            """.trimIndent(),
        )
            .param("id", Ids.newId()).param("s", sellerId).param("p", productId).param("v", variantId)
            .param("d", delta).param("r", reason).param("n", note).param("by", by)
            .update()
    }

    private fun placeholder(def: FieldDef) = when (def.kind) {
        ColumnKind.JSON -> "cast(:${def.name} as jsonb)"
        ColumnKind.TEXT_ARRAY -> "cast(:${def.name} as text[])"
        else -> ":${def.name}"
    }

    private fun bindValue(def: FieldDef, value: Any?): Any? = when (def.kind) {
        ColumnKind.TEXT -> value?.toString()
        ColumnKind.UUID -> (value as? String)?.let(UUID::fromString) ?: value as? UUID
        ColumnKind.INT -> (value as? Number)?.toInt()
        ColumnKind.LONG -> (value as? Number)?.toLong()
        ColumnKind.BOOL -> value as? Boolean
        // Array columns are NOT NULL: an absent list is an empty one.
        ColumnKind.TEXT_ARRAY -> ((value as? List<*>) ?: emptyList<Any?>()).map { it.toString() }.toTypedArray()
        ColumnKind.JSON -> when {
            value == null && def.name == "attributes" -> "{}"
            value == null -> null
            else -> json.writeValueAsString(value)
        }
    }

    // ------------------------------------------------------------ row mapping

    fun productRow(rs: ResultSet): MutableMap<String, Any?> {
        val row = linkedMapOf<String, Any?>()
        for (def in ProductColumns.READ_ONLY + ProductColumns.WRITABLE) row[def.name] = read(rs, def)
        row["rating"] = rs.getBigDecimal("rating")?.toDouble() ?: 0.0
        row["moderatedAt"] = rs.getTimestamp("moderated_at")?.toInstant()
        row["createdAt"] = rs.getTimestamp("created_at").toInstant()
        row["updatedAt"] = rs.getTimestamp("updated_at").toInstant()
        return row
    }

    fun variantRow(rs: ResultSet): MutableMap<String, Any?> {
        val row = linkedMapOf<String, Any?>("id" to rs.getString("id"), "productId" to rs.getString("product_id"), "sellerId" to rs.getString("seller_id"))
        for (def in VariantColumns.WRITABLE) row[def.name] = read(rs, def)
        row["createdAt"] = rs.getTimestamp("created_at").toInstant()
        row["updatedAt"] = rs.getTimestamp("updated_at").toInstant()
        return row
    }

    private fun read(rs: ResultSet, def: FieldDef): Any? = when (def.kind) {
        ColumnKind.TEXT, ColumnKind.UUID -> rs.getString(def.column)
        ColumnKind.INT -> rs.getObject(def.column)?.let { (it as Number).toInt() }
        ColumnKind.LONG -> rs.getObject(def.column)?.let { (it as Number).toLong() }
        ColumnKind.BOOL -> rs.getObject(def.column) as Boolean?
        ColumnKind.TEXT_ARRAY -> (rs.getArray(def.column)?.array as? Array<*>)?.map { it.toString() } ?: emptyList<String>()
        ColumnKind.JSON -> rs.getString(def.column)?.let { json.readValue(it, Any::class.java) }
    }
}
