package com.tailorae.customwear

import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Slugs
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.json.JsonMapper
import java.sql.ResultSet
import java.util.UUID

/**
 * The custom-wear catalogue. The legacy store shipped it as static data on the
 * storefront; here staff manage it and the storefront reads it.
 */
@Service
class CustomWearProductService(private val jdbc: JdbcClient, private val json: JsonMapper, private val audit: Audit) {

    // ---------------------------------------------------------------- storefront

    @Transactional(readOnly = true)
    fun query(filters: CustomWearFilters, pageSize: Int): ProductQueryResult = CustomWearQuery.query(active(), filters, pageSize)

    @Transactional(readOnly = true)
    fun bySlug(slug: String): CustomWearProduct =
        active().firstOrNull { it.slug == slug } ?: throw NotFoundException("Product not found")

    /** By slug or id, whichever the caller has. */
    @Transactional(readOnly = true)
    fun related(key: String, limit: Int): List<CustomWearProduct> {
        val catalogue = active()
        val product = catalogue.firstOrNull { it.slug == key || it.id.toString() == key } ?: throw NotFoundException("Product not found")
        return CustomWearQuery.related(product, catalogue, limit.coerceIn(1, 24))
    }

    @Transactional(readOnly = true)
    fun slugs(): List<String> =
        jdbc.sql("select slug from custom_wear_product where is_active order by slug").query(String::class.java).list().filterNotNull()

    /** An active product, for pricing a quote request against. */
    fun findActive(id: UUID): CustomWearProduct? =
        jdbc.sql("select * from custom_wear_product where id = :id and is_active").param("id", id)
            .query { rs, _ -> view(rs) }.optional().orElse(null)

    // ---------------------------------------------------------------- staff

    @Transactional(readOnly = true)
    fun all(includeInactive: Boolean): List<CustomWearProduct> =
        jdbc.sql("select * from custom_wear_product ${if (includeInactive) "" else "where is_active"} order by created_at desc")
            .query { rs, _ -> view(rs) }.list()

    @Transactional(readOnly = true)
    fun get(id: UUID): CustomWearProduct =
        jdbc.sql("select * from custom_wear_product where id = :id").param("id", id)
            .query { rs, _ -> view(rs) }.optional().orElseThrow { NotFoundException("Product not found") }

    @Transactional
    fun create(adminId: UUID, req: CustomWearProductRequest): CustomWearProduct {
        validate(req)
        val id = Ids.newId()
        val slug = slugFor(req, null)
        save(id, slug, req, insert = true)
        audit.record("admin", adminId, "CREATE", "custom_wear_product", id.toString(), after = mapOf("sku" to req.sku, "slug" to slug))
        return get(id)
    }

    @Transactional
    fun update(adminId: UUID, id: UUID, req: CustomWearProductRequest): CustomWearProduct {
        val before = get(id)
        validate(req)
        val slug = slugFor(req, id)
        save(id, slug, req, insert = false)
        audit.record("admin", adminId, "UPDATE", "custom_wear_product", id.toString(),
            mapOf("sku" to before.sku, "slug" to before.slug, "basePricePaise" to before.basePricePaise, "isActive" to before.isActive),
            mapOf("sku" to req.sku, "slug" to slug, "basePricePaise" to req.basePricePaise, "isActive" to req.isActive))
        return get(id)
    }

    /** Quotes keep their copy of the product fields, so removing a product never rewrites one. */
    @Transactional
    fun delete(adminId: UUID, id: UUID) {
        val before = get(id)
        jdbc.sql("delete from custom_wear_product where id = :id").param("id", id).update()
        audit.record("admin", adminId, "DELETE", "custom_wear_product", id.toString(), before = mapOf("sku" to before.sku, "slug" to before.slug))
    }

    // ---------------------------------------------------------------- helpers

    private fun validate(req: CustomWearProductRequest) {
        val errors = CustomWearProductRules.validate(req)
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))
    }

    private fun slugFor(req: CustomWearProductRequest, id: UUID?): String {
        val taken = { candidate: String ->
            jdbc.sql("select exists (select 1 from custom_wear_product where slug = :s and id is distinct from :id)")
                .param("s", candidate).param("id", id).query(Boolean::class.javaObjectType).single()
        }
        val wanted = req.slug?.trim()?.takeIf { it.isNotEmpty() }
        if (wanted != null) {
            val clean = Slugs.slugify(wanted, 160)
            if (taken(clean)) throw ConflictException("Another product already uses the slug $clean")
            return clean
        }
        return Slugs.unique(req.name, taken)
    }

    private fun save(id: UUID, slug: String, req: CustomWearProductRequest, insert: Boolean) {
        val columns = """
            slug = :slug, sku = :sku, name = :name, short_description = :short, description = :description,
            gender = :gender, category = :category, product_type = :type, fabric = :fabric, gsm = :gsm, fit = :fit,
            base_price_paise = :base, max_price_paise = :max, currency = :currency,
            min_order_quantity = :moq, default_quantity = :defaultQty, rating = :rating, review_count = :reviews,
            popularity = :popularity, is_active = :active,
            colors = cast(:colors as jsonb), sizes = cast(:sizes as jsonb), price_tiers = cast(:tiers as jsonb),
            customization_methods = cast(:methods as jsonb), customization_locations = cast(:locations as jsonb),
            images = cast(:images as jsonb), accordions = cast(:accordions as jsonb),
            description_block = cast(:block as jsonb), size_chart = cast(:chart as jsonb),
            badges = array(select jsonb_array_elements_text(cast(:badges as jsonb))),
            highlights = array(select jsonb_array_elements_text(cast(:highlights as jsonb))),
            related_product_ids = array(select jsonb_array_elements_text(cast(:related as jsonb))::uuid),
            updated_at = now()
        """.trimIndent()
        val tiers = req.priceTiers.sortedBy { it.minQty }
        try {
            if (insert) {
                // Insert the key columns, then one update writes everything, so there is one column list.
                jdbc.sql("insert into custom_wear_product (id, slug, sku, name, gender, category, product_type, base_price_paise) values (:id, :slug, :sku, :name, :gender, :category, :type, :base)")
                    .param("id", id).param("slug", slug).param("sku", req.sku.trim()).param("name", req.name.trim())
                    .param("gender", req.gender).param("category", req.category).param("type", req.productType).param("base", req.basePricePaise)
                    .update()
            }
            jdbc.sql("update custom_wear_product set $columns where id = :id")
                .param("id", id).param("slug", slug).param("sku", req.sku.trim()).param("name", req.name.trim())
                .param("short", req.shortDescription.trim()).param("description", req.description.trim())
                .param("gender", req.gender).param("category", req.category).param("type", req.productType)
                .param("fabric", req.fabric).param("gsm", req.gsm).param("fit", req.fit?.trim())
                .param("base", req.basePricePaise).param("max", CustomWearProductRules.maxPrice(req))
                .param("currency", req.currency.uppercase())
                .param("moq", req.minOrderQuantity).param("defaultQty", req.defaultQuantity)
                .param("rating", req.rating).param("reviews", req.reviewCount).param("popularity", req.popularity)
                .param("active", req.isActive)
                .param("colors", json.writeValueAsString(req.colors)).param("sizes", json.writeValueAsString(req.sizes))
                .param("tiers", json.writeValueAsString(tiers))
                .param("methods", json.writeValueAsString(req.customizationMethods))
                .param("locations", json.writeValueAsString(req.customizationLocations))
                .param("images", json.writeValueAsString(req.images)).param("accordions", json.writeValueAsString(req.accordions))
                .param("block", req.descriptionBlock?.let(json::writeValueAsString))
                .param("chart", req.sizeChart?.let(json::writeValueAsString))
                .param("badges", json.writeValueAsString(req.badges.distinct()))
                .param("highlights", json.writeValueAsString(req.highlights))
                .param("related", json.writeValueAsString(req.relatedProductIds.distinct().filter { it != id }))
                .update()
        } catch (e: DuplicateKeyException) {
            throw ConflictException("Another product already uses that SKU or slug")
        }
    }

    private fun active(): List<CustomWearProduct> =
        jdbc.sql("select * from custom_wear_product where is_active order by created_at, id").query { rs, _ -> view(rs) }.list()

    private fun <T> list(raw: String?, type: TypeReference<List<T>>): List<T> = raw?.let { json.readValue(it, type) } ?: emptyList()

    private fun strings(rs: ResultSet, column: String): List<String> =
        (rs.getArray(column)?.array as? Array<*>)?.map { it.toString() } ?: emptyList()

    private fun view(rs: ResultSet) = CustomWearProduct(
        id = rs.getObject("id", UUID::class.java),
        slug = rs.getString("slug"),
        sku = rs.getString("sku"),
        name = rs.getString("name"),
        shortDescription = rs.getString("short_description"),
        description = rs.getString("description"),
        gender = rs.getString("gender"),
        category = rs.getString("category"),
        productType = rs.getString("product_type"),
        fabric = rs.getString("fabric"),
        gsm = rs.getObject("gsm") as Int?,
        fit = rs.getString("fit"),
        basePricePaise = rs.getLong("base_price_paise"),
        currency = rs.getString("currency"),
        maxPricePaise = rs.getObject("max_price_paise") as Long?,
        priceTiers = list(rs.getString("price_tiers"), TIERS),
        colors = list(rs.getString("colors"), COLORS),
        sizes = list(rs.getString("sizes"), SIZES),
        customizationMethods = list(rs.getString("customization_methods"), METHODS),
        customizationLocations = list(rs.getString("customization_locations"), LOCATIONS),
        images = list(rs.getString("images"), IMAGES),
        rating = rs.getDouble("rating"),
        reviewCount = rs.getInt("review_count"),
        badges = strings(rs, "badges"),
        minOrderQuantity = rs.getInt("min_order_quantity"),
        defaultQuantity = rs.getObject("default_quantity") as Int?,
        highlights = strings(rs, "highlights"),
        accordions = list(rs.getString("accordions"), ACCORDIONS),
        descriptionBlock = rs.getString("description_block")?.let { json.readValue(it, ProductDescriptionBlock::class.java) },
        sizeChart = rs.getString("size_chart")?.let { json.readValue(it, SizeChart::class.java) },
        relatedProductIds = strings(rs, "related_product_ids").map(UUID::fromString),
        popularity = rs.getInt("popularity"),
        isActive = rs.getBoolean("is_active"),
        createdAt = rs.getTimestamp("created_at").toInstant(),
        updatedAt = rs.getTimestamp("updated_at").toInstant(),
    )

    private companion object {
        val TIERS = object : TypeReference<List<PriceTier>>() {}
        val COLORS = object : TypeReference<List<ProductColor>>() {}
        val SIZES = object : TypeReference<List<ProductSize>>() {}
        val METHODS = object : TypeReference<List<CustomizationMethodOption>>() {}
        val LOCATIONS = object : TypeReference<List<CustomizationLocationOption>>() {}
        val IMAGES = object : TypeReference<List<ProductImage>>() {}
        val ACCORDIONS = object : TypeReference<List<ProductAccordionSection>>() {}
    }
}
