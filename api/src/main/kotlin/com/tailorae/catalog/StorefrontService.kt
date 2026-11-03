package com.tailorae.catalog

import com.tailorae.catalog.rules.Catalogue
import com.tailorae.catalog.rules.CategoryTree
import com.tailorae.catalog.rules.ColourFamilies
import com.tailorae.catalog.rules.ProductSpec
import com.tailorae.catalog.rules.SearchText
import com.tailorae.common.NotFoundException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/** The shop listing's query string, in the legacy public URL contract. */
data class ListingQuery(
    val q: String? = null,
    val category: String? = null,
    val brand: String? = null,
    val vendor: String? = null,
    /** Comma-separated colour families (or old colour names, read as their family). */
    val color: String? = null,
    val size: String? = null,
    val ageGroup: String? = null,
    val audience: String? = null,
    val match: String? = null,
    val exclude: String? = null,
    val minPricePaise: Long? = null,
    val maxPricePaise: Long? = null,
    val featured: Boolean = false,
    val sale: Boolean = false,
    val newest: Boolean = false,
    val inStock: Boolean = false,
    val ids: String? = null,
    val sortBy: String? = null,
    /** `attr_<key>=<value>` pairs, limited to filterable keys before use. */
    val attributes: Map<String, String> = emptyMap(),
    val page: Int = 1,
    val limit: Int = 12,
)

/**
 * Everything a shopper reads: the listing with its filters and sorts, search
 * (Postgres full text ranked with pg_trgm similarity, with a trigram fallback
 * for typos), facets, the product page, and the brand and shop pages.
 *
 * One visibility rule everywhere: ACTIVE, APPROVED, and the shop APPROVED.
 */
@Service
class StorefrontService(
    private val jdbc: JdbcClient,
    private val repo: ProductRepository,
    private val views: ProductViews,
    private val categories: CategoryService,
    private val json: tools.jackson.databind.json.JsonMapper,
) {
    private class Filter(val where: String, val params: Map<String, Any?>, val tokens: List<String>, val phrase: String, val tsQuery: String?)

    // ------------------------------------------------------------ listing

    data class Listing(val products: List<Map<String, Any?>>, val page: Int, val limit: Int, val total: Long)

    @Transactional(readOnly = true)
    fun list(query: ListingQuery): Listing {
        val page = query.page.coerceAtLeast(1)
        val limit = query.limit.coerceIn(1, 50)
        val filter = filter(query)
        val requestedIds = idList(query.ids)
        val total = jdbc.sql("select count(*) from product p join seller s on s.id = p.seller_id where ${filter.where}")
            .params(filter.params).query(Long::class.javaObjectType).single()
        val wantsRelevance = filter.tsQuery != null && requestedIds == null && (query.sortBy == null || query.sortBy == "relevance")
        val order = when {
            requestedIds != null -> "array_position(cast(:idOrder as uuid[]), p.id)"
            wantsRelevance -> "$RANK desc, p.rating desc, p.name, p.id"
            else -> when (query.sortBy) {
                "price_asc", "price-low" -> "p.price_paise, p.id"
                "price_desc", "price-high" -> "p.price_paise desc, p.id"
                "rating" -> "p.rating desc, p.rating_count desc, p.id"
                // Units sold needs orders, which do not exist yet; most-reviewed is the stand-in.
                "popular" -> "p.rating_count desc, p.rating desc, p.created_at desc, p.id"
                else -> "p.created_at desc, p.id"
            }
        }
        val params = filter.params.toMutableMap()
        if (requestedIds != null) params["idOrder"] = requestedIds.map(UUID::toString).toTypedArray()
        val paging = if (requestedIds != null) "" else " limit :limit offset :offset"
        params["limit"] = limit
        params["offset"] = (page - 1) * limit
        val rows = jdbc.sql("select p.* from product p join seller s on s.id = p.seller_id where ${filter.where} order by $order$paging")
            .params(params).query { rs, _ -> repo.productRow(rs) }.list()
        return Listing(views.cards(rows), page, limit, total)
    }

    /** Typeahead: the listing's own filter and ranking, then a trigram sweep when nothing matched literally. */
    @Transactional(readOnly = true)
    fun suggest(term: String?, requestedLimit: Int?): Map<String, Any?> {
        val phrase = term?.trim()?.lowercase().orEmpty()
        val limit = (requestedLimit ?: 8).coerceIn(1, 20)
        val tokens = if (phrase.isEmpty()) emptyList() else SearchText.tokens(phrase)
        if (tokens.isEmpty()) return mapOf("items" to emptyList<Any>(), "fuzzy" to false)
        val filter = filter(ListingQuery(q = phrase))
        val strict = jdbc.sql("select p.* from product p join seller s on s.id = p.seller_id where ${filter.where} order by $RANK desc, p.rating desc, p.name limit :limit")
            .params(filter.params + mapOf("limit" to limit)).query { rs, _ -> repo.productRow(rs) }.list()
        if (strict.isNotEmpty()) return mapOf("items" to suggestions(strict), "fuzzy" to false)
        // One or two letters that match nothing is someone still typing, not a typo.
        if (phrase.length < 3) return mapOf("items" to emptyList<Any>(), "fuzzy" to false)
        val near = jdbc.sql(
            """
            select p.* from product p join seller s on s.id = p.seller_id
            where $VISIBLE and greatest(similarity(lower(p.name), :phrase), word_similarity(:phrase, lower(p.name)), similarity(lower(p.sku), :phrase)) >= :threshold
            order by greatest(similarity(lower(p.name), :phrase), word_similarity(:phrase, lower(p.name)), similarity(lower(p.sku), :phrase)) desc, p.name
            limit :limit
            """.trimIndent(),
        ).param("phrase", phrase).param("threshold", FUZZY_THRESHOLD).param("limit", limit).query { rs, _ -> repo.productRow(rs) }.list()
        return mapOf("items" to suggestions(near), "fuzzy" to near.isNotEmpty())
    }

    private fun suggestions(rows: List<Map<String, Any?>>): List<Map<String, Any?>> {
        val categoryIds = rows.mapNotNull { it["categoryId"] as String? }.distinct().map(UUID::fromString)
        val names = if (categoryIds.isEmpty()) emptyMap() else jdbc.sql("select id, name, slug from category where id in (:ids)").param("ids", categoryIds)
            .query { rs, _ -> rs.getString("id") to mapOf("name" to rs.getString("name"), "slug" to rs.getString("slug")) }.list().toMap()
        return rows.map {
            mapOf("id" to it["id"], "name" to it["name"], "slug" to it["slug"], "pricePaise" to it["pricePaise"], "mrpPaise" to it["mrpPaise"],
                "thumbnail" to it["thumbnail"], "category" to names[it["categoryId"]])
        }
    }

    // ------------------------------------------------------------ facets

    /**
     * Facets over the products the filters match: sizes (size-chart order),
     * "ideal for" age groups and template attributes — the legacy shape — plus
     * category, brand, colour family and price-bucket counts.
     */
    @Transactional(readOnly = true)
    fun facets(query: ListingQuery): Map<String, Any?> {
        val filter = filter(query)
        val matched = "select p.id from product p join seller s on s.id = p.seller_id where ${filter.where}"
        val params = filter.params

        val rows = categories.rows()
        val scope = query.category?.trim()?.takeIf { it.isNotEmpty() }?.let { CategoryTree.scope(rows, it) } ?: emptyList()
        val extras = categories.extras(scope.firstOrNull())
        val hasExtras = extras.columns.isNotEmpty() || extras.optionLabel != null
        val template = ProductSpec.templateInfo(
            if (scope.isNotEmpty()) CategoryTree.resolveTemplate(rows, scope.first()) ?: (if (hasExtras) "general" else null) else null, extras,
        )
        val attributeColumns = template?.let { ProductSpec.filterableAttributes(it.slug, extras.columns) } ?: emptyList()

        val sizeValues = jdbc.sql("select distinct trim(v.size) from product_variant v where v.quantity > 0 and v.size is not null and trim(v.size) <> '' and v.product_id in ($matched)")
            .params(params).query(String::class.java).list().filterNotNull()
        val sizes = sizeValues.distinctBy { it.lowercase() }.sortedWith(compareBy<String> { sizeRank(it) }.thenBy { it.lowercase() })
            .map { mapOf("value" to it, "group" to sizeGroupOf(it)) }

        val ages = jdbc.sql("select distinct p.age_group from product p where p.age_group is not null and p.id in ($matched)")
            .params(params).query(String::class.java).list().filterNotNull().sorted()
            .map { mapOf("value" to it, "label" to (it.split("-").last().trim().ifEmpty { it })) }

        val attributes = if (attributeColumns.isEmpty()) emptyList() else {
            val maps = jdbc.sql("select p.attributes::text from product p where p.id in ($matched) limit 2000").params(params)
                .query(String::class.java).list().filterNotNull().map { parseAttributes(it) }
            attributeColumns.mapNotNull { column ->
                val present = maps.flatMap { m ->
                    when (val v = m[column.key]) { is List<*> -> v; null -> emptyList(); else -> listOf(v) }
                }.filterIsInstance<String>().filter { it.isNotBlank() }.toSet()
                val ordered = column.options.filter { it in present }
                val extra = present.filter { it !in column.options }.sortedWith(
                    if (column.kind == "number") compareBy { it.toDoubleOrNull() ?: Double.MAX_VALUE } else compareBy { it.lowercase() },
                )
                val values = ordered + extra
                if (values.isEmpty()) null else linkedMapOf("key" to column.key, "label" to column.label, "values" to values).apply { column.unit?.let { put("unit", it) } }
            }
        }

        val categoryCounts = jdbc.sql(
            "select c.id, c.name, c.slug, count(*) as n from product p join category c on c.id = p.category_id where p.id in ($matched) group by c.id, c.name, c.slug order by n desc, c.name",
        ).params(params).query { rs, _ -> mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug"), "count" to rs.getLong("n")) }.list()
        val brandCounts = jdbc.sql(
            "select b.id, b.name, b.slug, count(*) as n from product p join brand b on b.id = p.brand_id where p.id in ($matched) group by b.id, b.name, b.slug order by n desc, b.name",
        ).params(params).query { rs, _ -> mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug"), "count" to rs.getLong("n")) }.list()

        return linkedMapOf(
            "sizes" to sizes, "ageGroups" to ages, "attributes" to attributes, "optionLabel" to (template?.optionLabel ?: "Size"),
            "categories" to categoryCounts, "brands" to brandCounts, "colours" to colourCounts(matched, params),
            "priceBuckets" to priceBuckets(matched, params),
        )
    }

    /** Colour families (the fixed list, in its own order) with how many matching products carry each. */
    @Transactional(readOnly = true)
    fun colours(query: ListingQuery): Map<String, Any?> {
        val filter = filter(query)
        val families = colourCounts("select p.id from product p join seller s on s.id = p.seller_id where ${filter.where}", filter.params)
        return mapOf("families" to families, "colors" to families.map { it["name"] })
    }

    private fun colourCounts(matched: String, params: Map<String, Any?>): List<Map<String, Any?>> {
        val counts = jdbc.sql(
            """
            select family, count(distinct product_id) as n from (
                select p.id as product_id, p.color_family as family from product p where p.color_family is not null and p.id in ($matched)
                union all
                select v.product_id, v.color_family from product_variant v where v.color_family is not null and v.product_id in ($matched)
            ) f group by family
            """.trimIndent(),
        ).params(params).query { rs, _ -> rs.getString("family") to rs.getLong("n") }.list().toMap()
        return ColourFamilies.ALL.filter { it.name in counts }.map { mapOf("name" to it.name, "slug" to it.slug, "hex" to it.hex, "count" to counts.getValue(it.name)) }
    }

    private fun priceBuckets(matched: String, params: Map<String, Any?>): List<Map<String, Any?>> {
        val counts = jdbc.sql(
            """
            select width_bucket(p.price_paise, array[${PRICE_EDGES.joinToString(",")}]::bigint[]) as bucket, count(*) as n
            from product p where p.id in ($matched) group by bucket
            """.trimIndent(),
        ).params(params).query { rs, _ -> rs.getInt("bucket") to rs.getLong("n") }.list().toMap()
        val edges = listOf(0L) + PRICE_EDGES
        return edges.indices.mapNotNull { i ->
            // width_bucket: 0 below the first edge, i between edge i-1 and edge i, the last above them all.
            val n = counts[i] ?: return@mapNotNull null
            val min = edges[i]
            val max = edges.getOrNull(i + 1)?.minus(1)
            val label = if (max == null) "Over ₹${min / 100}" else if (min == 0L) "Under ₹${(max + 1) / 100}" else "₹${min / 100} – ₹${(max + 1) / 100}"
            mapOf("label" to label, "minPaise" to min, "maxPaise" to max, "count" to n)
        }
    }

    // ------------------------------------------------------------ product page

    @Transactional(readOnly = true)
    fun detail(idOrSlug: String): Map<String, Any?> {
        val asId = runCatching { UUID.fromString(idOrSlug) }.getOrNull()
        val product = (asId?.let { repo.product(it) } ?: repo.productBySlug(idOrSlug)) ?: throw NotFoundException("Product not found")
        if (!visible(UUID.fromString(product["id"] as String))) throw NotFoundException("Product not found")
        val out = views.detail(product, includePrivate = false)
        val rows = categories.rows()
        val categoryId = product["categoryId"] as String
        val extras = categories.extras(categoryId)
        out["listing"] = ProductSpec.templateInfo(product["articleType"] as String?, extras)
            ?: ProductSpec.templateInfo(CategoryTree.resolveTemplate(rows, categoryId) ?: (if (extras.columns.isNotEmpty()) "general" else null), extras)
        val byId = rows.associateBy { it.id }
        val trail = mutableListOf<com.tailorae.catalog.rules.CategoryRow>()
        val seen = mutableSetOf<String>()
        var at = byId[categoryId]
        while (at != null && seen.add(at.id)) { trail.add(0, at); at = at.parentId?.let(byId::get) }
        out["categoryTrail"] = trail.mapIndexed { i, c -> mapOf("id" to c.id, "name" to c.name, "slug" to c.slug, "path" to trail.take(i + 1).map { it.slug }) }
        out["colourSiblings"] = (product["colourGroupId"] as String?)?.let { group ->
            jdbc.sql(
                """
                select p.id, p.slug, p.name, p.color, p.brand_colour, p.thumbnail from product p join seller s on s.id = p.seller_id
                where p.colour_group_id = :g and p.seller_id = cast(:seller as uuid) and $VISIBLE order by p.created_at limit 12
                """.trimIndent(),
            ).param("g", group).param("seller", product["sellerId"]).query { rs, _ ->
                mapOf("id" to rs.getString("id"), "slug" to rs.getString("slug"), "name" to rs.getString("name"),
                    "colour" to (rs.getString("brand_colour")?.ifEmpty { null } ?: rs.getString("color")), "thumbnail" to rs.getString("thumbnail"),
                    "current" to (rs.getString("id") == product["id"]))
            }.list()
        } ?: emptyList<Any>()
        return out
    }

    private fun visible(id: UUID): Boolean =
        jdbc.sql("select exists (select 1 from product p join seller s on s.id = p.seller_id where p.id = :id and $VISIBLE)")
            .param("id", id).query(Boolean::class.javaObjectType).single()

    // ------------------------------------------------------------ brands and shops

    @Transactional(readOnly = true)
    fun brands(): List<Map<String, Any?>> =
        jdbc.sql(
            """
            select b.id, b.name, b.slug, b.logo, b.is_featured, count(p.id) as n
            from brand b join product p on p.brand_id = b.id join seller s on s.id = p.seller_id
            where b.is_active and $VISIBLE group by b.id order by b.display_order, b.name
            """.trimIndent(),
        ).query { rs, _ ->
            mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug"), "logo" to rs.getString("logo"),
                "isFeatured" to rs.getBoolean("is_featured"), "_count" to mapOf("products" to rs.getLong("n")))
        }.list()

    @Transactional(readOnly = true)
    fun brand(slugOrId: String): Map<String, Any?> =
        jdbc.sql(
            """
            select b.*, (select count(*) from product p join seller s on s.id = p.seller_id where p.brand_id = b.id and $VISIBLE) as n
            from brand b where b.is_active and (b.slug = :k or b.id::text = :k)
            """.trimIndent(),
        ).param("k", slugOrId).query { rs, _ ->
            mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug"), "description" to rs.getString("description"),
                "logo" to rs.getString("logo"), "banner" to rs.getString("banner"), "isFeatured" to rs.getBoolean("is_featured"),
                "metaTitle" to rs.getString("meta_title"), "metaDescription" to rs.getString("meta_description"),
                "_count" to mapOf("products" to rs.getLong("n")))
        }.optional().orElseThrow { NotFoundException("Brand not found") }

    @Transactional(readOnly = true)
    fun sellers(): List<Map<String, Any?>> =
        jdbc.sql(
            """
            select s.*, count(p.id) as n from seller s join product p on p.seller_id = s.id
            where not s.is_platform and $VISIBLE group by s.id order by s.shop_name
            """.trimIndent(),
        ).query { rs, _ -> shopView(rs) }.list()

    @Transactional(readOnly = true)
    fun seller(slugOrId: String): Map<String, Any?> =
        jdbc.sql(
            """
            select s.*, (select count(*) from product p where p.seller_id = s.id and p.status = 'ACTIVE' and p.moderation_status = 'APPROVED') as n
            from seller s where s.status = 'APPROVED' and (s.shop_slug = :k or s.id::text = :k)
            """.trimIndent(),
        ).param("k", slugOrId).query { rs, _ -> shopView(rs) + mapOf("createdAt" to rs.getTimestamp("created_at").toInstant()) }
            .optional().orElseThrow { NotFoundException("Seller not found") }

    private fun shopView(rs: java.sql.ResultSet): Map<String, Any?> = linkedMapOf(
        "id" to rs.getString("id"), "shopName" to rs.getString("shop_name"), "shopSlug" to rs.getString("shop_slug"),
        "shopImage" to rs.getString("shop_image"), "shopBanner" to rs.getString("shop_banner"),
        "shopDescription" to rs.getString("shop_description"), "isVerified" to true,
        "rating" to (rs.getBigDecimal("rating")?.toDouble() ?: 0.0), "ratingCount" to rs.getInt("rating_count"),
        "_count" to mapOf("products" to rs.getLong("n")),
    )

    // ------------------------------------------------------------ the filter

    private fun filter(query: ListingQuery): Filter {
        val clauses = mutableListOf(VISIBLE)
        val params = linkedMapOf<String, Any?>()

        idList(query.ids)?.let { ids ->
            clauses += "p.id = any(cast(:ids as uuid[]))"
            params["ids"] = ids.map(UUID::toString).toTypedArray()
        }

        val phrase = query.q?.trim()?.lowercase().orEmpty()
        val tokens = if (phrase.isEmpty()) emptyList() else SearchText.tokens(phrase)
        val tsTerms = tokens.map { it.replace(Regex("[^\\p{L}\\p{N}]+"), "") }.filter { it.isNotEmpty() }
        val tsQuery = tsTerms.takeIf { it.isNotEmpty() }?.joinToString(" & ") { "$it:*" }
        if (tokens.isNotEmpty()) {
            clauses += buildString {
                append("(")
                if (tsQuery != null) append("p.search_vector @@ to_tsquery('english', :tsq) or ")
                append("lower(p.sku) = :phrase or lower(p.name) like :phraseLike ")
                append("or exists (select 1 from product_variant v where v.product_id = p.id and lower(v.sku) = :phrase))")
            }
            params["tsq"] = tsQuery ?: ""
            params["phrase"] = phrase
            params["phraseLike"] = "%${escapeLike(phrase)}%"
        } else {
            // The rank expression is referenced only with a query; keep its parameters bound.
            params["tsq"] = ""
            params["phrase"] = ""
        }

        if (!query.color.isNullOrBlank()) {
            val families = query.color.split(",").mapNotNull { (ColourFamilies.canonical(it) ?: ColourFamilies.suggest(it))?.name }.distinct()
            if (families.isEmpty()) clauses += "false" // nothing recognisable asked for: match nothing rather than everything
            else {
                clauses += "(p.color_family = any(cast(:families as text[])) or exists (select 1 from product_variant v where v.product_id = p.id and v.color_family = any(cast(:families as text[]))))"
                params["families"] = families.toTypedArray()
            }
        }
        query.brand?.trim()?.takeIf { it.isNotEmpty() }?.let {
            clauses += "p.brand_id in (select b.id from brand b where b.slug = :brand or b.id::text = :brand)"
            params["brand"] = it
        }
        query.vendor?.trim()?.takeIf { it.isNotEmpty() }?.let {
            clauses += "(s.shop_slug = :vendor or s.id::text = :vendor)"
            params["vendor"] = it
        }
        query.size?.trim()?.takeIf { it.isNotEmpty() }?.let {
            clauses += "exists (select 1 from product_variant v where v.product_id = p.id and (lower(v.size) = lower(:size) or lower(v.standard_size) = lower(:size)))"
            params["size"] = it
        }
        query.ageGroup?.trim()?.takeIf { it.isNotEmpty() }?.let {
            clauses += "p.age_group ilike :ageGroup"
            params["ageGroup"] = "%${escapeLike(it)}%"
        }
        query.audience?.trim()?.takeIf { it.isNotEmpty() }?.let {
            clauses += "(p.age_group ilike :audience or p.age_group is null)"
            params["audience"] = "%${escapeLike(it)}%"
        }
        keywords(query.match).takeIf { it.isNotEmpty() }?.let {
            clauses += "p.name ilike any(cast(:match as text[]))"
            params["match"] = it.map { w -> "%${escapeLike(w)}%" }.toTypedArray()
        }
        keywords(query.exclude).takeIf { it.isNotEmpty() }?.let {
            clauses += "not (p.name ilike any(cast(:exclude as text[])))"
            params["exclude"] = it.map { w -> "%${escapeLike(w)}%" }.toTypedArray()
        }
        if (query.newest) clauses += "p.created_at >= now() - interval '30 days'"

        // A category covers everything nested under it; an unknown one covers nothing.
        var categoryKinds = emptyMap<String, String>()
        query.category?.trim()?.takeIf { it.isNotEmpty() }?.let { wanted ->
            val scope = CategoryTree.scope(categories.rows(), wanted)
            clauses += "p.category_id = any(cast(:categories as uuid[]))"
            params["categories"] = scope.toTypedArray()
            categoryKinds = categories.columns(scope.firstOrNull()).filter { it.filterable }.associate { it.key to it.kind }
        }
        // Only keys some template (or this category) marks filterable, so a query cannot probe arbitrary JSON paths.
        query.attributes.entries.filter { (k, v) -> v.isNotBlank() && (k in FILTERABLE_KEYS || k in categoryKinds) }.take(8)
            .forEachIndexed { i, (key, value) ->
                params["ak$i"] = key
                params["av$i"] = value.trim().take(80)
                clauses += if (categoryKinds[key] == "multiselect") "(p.attributes -> :ak$i) @> jsonb_build_array(cast(:av$i as text))"
                else "(p.attributes ->> :ak$i) = :av$i"
            }
        query.minPricePaise?.let { clauses += "p.price_paise >= :minPrice"; params["minPrice"] = it }
        query.maxPricePaise?.let { clauses += "p.price_paise <= :maxPrice"; params["maxPrice"] = it }
        if (query.featured) clauses += "p.is_featured"
        if (query.sale) clauses += "p.mrp_paise > p.price_paise"
        if (query.inStock) {
            clauses += """(case when exists (select 1 from product_variant v where v.product_id = p.id)
                then exists (select 1 from product_variant v where v.product_id = p.id and v.quantity > 0) else p.quantity > 0 end)"""
        }
        return Filter(clauses.joinToString(" and "), params, tokens, phrase, tsQuery)
    }

    private fun parseAttributes(raw: String): Map<String, Any?> =
        runCatching { json.readValue(raw, Map::class.java) }.getOrNull()
            ?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()

    private fun idList(raw: String?): List<UUID>? =
        raw?.split(",")?.mapNotNull { runCatching { UUID.fromString(it.trim()) }.getOrNull() }?.distinct()?.take(50)?.takeIf { raw.isNotBlank() }

    private fun keywords(raw: String?): List<String> =
        raw?.split(",")?.map { it.trim().lowercase() }?.filter { it.isNotEmpty() }?.take(12) ?: emptyList()

    private fun escapeLike(value: String) = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    private fun sizeRank(size: String): Int =
        Catalogue.SIZE_ORDER.indexOfFirst { it.equals(size, ignoreCase = true) }.let { if (it < 0) Int.MAX_VALUE else it }

    private fun sizeGroupOf(size: String): String = when {
        Regex("^UK \\d", RegexOption.IGNORE_CASE).containsMatchIn(size) -> "UK sizes"
        Regex("^\\d+(\\.\\d+)?(-\\d+(\\.\\d+)?)?M$", RegexOption.IGNORE_CASE).matches(size) ||
            Regex("baby|newborn|upto", RegexOption.IGNORE_CASE).containsMatchIn(size) -> "Baby"
        Regex("^\\d+(\\.\\d+)?(-\\d+(\\.\\d+)?)?Y$", RegexOption.IGNORE_CASE).matches(size) -> "Kids"
        Regex("^\\d+/\\d+$").matches(size) || Regex("^\\d+$").matches(size) -> "Waist / length"
        Regex("^([3-9]|1\\d)XL$", RegexOption.IGNORE_CASE).matches(size) -> "Plus"
        else -> "Adult"
    }

    companion object {
        /** What a shopper may see: live, checked, and from a live shop. Expects `p` (product) and `s` (its seller). */
        const val VISIBLE = "p.status = 'ACTIVE' and p.moderation_status = 'APPROVED' and s.status = 'APPROVED'"

        /** Full-text rank, an exact article number or name winning outright, then name similarity for near spellings. */
        private const val RANK = """(case when :tsq = '' then 0 else ts_rank_cd(p.search_vector, to_tsquery('english', :tsq)) end
            + case when lower(p.sku) = :phrase then 10 else 0 end + case when lower(p.name) = :phrase then 6 else 0 end
            + similarity(lower(p.name), :phrase) + case when p.is_featured then 0.05 else 0 end)"""

        private const val FUZZY_THRESHOLD = 0.34

        /** Price-bucket edges in paise: under ₹500, ₹500–1000, ₹1000–2000, ₹2000–5000, over ₹5000. */
        private val PRICE_EDGES = listOf(50_000L, 100_000L, 200_000L, 500_000L)

        private val FILTERABLE_KEYS = ProductSpec.filterableAttributes().map { it.key }.toSet()
    }
}
