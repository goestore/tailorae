package com.tailorae.catalog

import com.tailorae.catalog.rules.ColourFamilySync
import com.tailorae.catalog.rules.ProductSpec
import com.tailorae.catalog.rules.Values
import com.tailorae.common.ApiException
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Outbox
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.SellerScope
import com.tailorae.common.Slugs
import com.tailorae.seller.CurrentSeller
import com.tailorae.seller.SellerStatus
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * Listing writes, for the owning seller and for staff.
 *
 * Moderation (docs/ACCOUNTS.md): a seller's listing starts PENDING; an edit
 * to a shopper-visible field sends an APPROVED listing back to PENDING, while
 * price and stock edits do not. A staff write is the check itself, so it is
 * APPROVED. Shoppers only ever see ACTIVE + APPROVED listings of APPROVED shops.
 */
@Service
class ProductService(
    private val jdbc: JdbcClient,
    private val json: JsonMapper,
    private val scope: SellerScope,
    private val outbox: Outbox,
    private val audit: Audit,
    private val categories: CategoryService,
    private val brands: BrandService,
    private val repo: ProductRepository,
    private val views: ProductViews,
) {
    /** Who is writing: the owning seller, or a staff member. */
    private sealed interface Actor {
        val realm: String
        val id: UUID
    }

    private data class SellerActor(val seller: CurrentSeller) : Actor {
        override val realm = "seller"
        override val id: UUID get() = seller.accountId
    }

    private data class StaffActor(override val id: UUID) : Actor {
        override val realm = "admin"
    }

    // ================================================================ seller

    @Transactional(readOnly = true)
    fun sellerList(current: CurrentSeller, status: String?, query: String?, page: PageParams): Page<Map<String, Any?>> {
        scope.enter(current.sellerId)
        val where = buildString {
            append("where p.seller_id = :s")
            if (status != null && status in ProductColumns.STATUSES) append(" and p.status = :status")
            if (!query.isNullOrBlank()) append(" and (p.name ilike :q or p.sku ilike :q)")
        }
        fun <T : JdbcClient.StatementSpec> T.bind(): T = apply {
            param("s", current.sellerId)
            if (status != null && status in ProductColumns.STATUSES) param("status", status)
            if (!query.isNullOrBlank()) param("q", "%${query.trim()}%")
        }
        val total = jdbc.sql("select count(*) from product p $where").bind().query(Long::class.javaObjectType).single()
        val rows = jdbc.sql(
            """
            select p.*, c.name as category_name, b.name as brand_name,
                   (select coalesce(sum(v.quantity), 0) from product_variant v where v.product_id = p.id) as variant_stock,
                   (select count(*) from product_variant v where v.product_id = p.id) as variant_count
            from product p join category c on c.id = p.category_id left join brand b on b.id = p.brand_id
            $where order by p.created_at desc limit :limit offset :offset
            """.trimIndent(),
        ).bind().param("limit", page.safeLimit).param("offset", page.offset).query { rs, _ ->
            linkedMapOf<String, Any?>(
                "id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug"), "sku" to rs.getString("sku"),
                "pricePaise" to rs.getLong("price_paise"), "mrpPaise" to rs.getObject("mrp_paise")?.let { (it as Number).toLong() },
                "quantity" to if (rs.getLong("variant_count") > 0) rs.getLong("variant_stock").toInt() else rs.getInt("quantity"),
                "status" to rs.getString("status"), "moderationStatus" to rs.getString("moderation_status"),
                "moderationNote" to rs.getString("moderation_note"), "thumbnail" to rs.getString("thumbnail"),
                "category" to mapOf("name" to rs.getString("category_name")),
                "brand" to rs.getString("brand_name")?.let { mapOf("name" to it) },
                "createdAt" to rs.getTimestamp("created_at").toInstant(), "updatedAt" to rs.getTimestamp("updated_at").toInstant(),
            )
        }.list()
        return Page(rows, total, page.safePage, page.safeLimit)
    }

    @Transactional(readOnly = true)
    fun sellerGet(current: CurrentSeller, id: UUID): Map<String, Any?> {
        scope.enter(current.sellerId)
        return views.detail(own(current, id), includePrivate = true)
    }

    @Transactional
    fun sellerCreate(current: CurrentSeller, body: Map<String, Any?>): Map<String, Any?> {
        scope.enter(current.sellerId)
        requireCanSell(current)
        return create(SellerActor(current), current.sellerId, body)
    }

    @Transactional
    fun sellerUpdate(current: CurrentSeller, id: UUID, body: Map<String, Any?>): Pair<Map<String, Any?>, Boolean> {
        scope.enter(current.sellerId)
        val stored = own(current, id)
        requireCanSell(current)
        return update(SellerActor(current), stored, body)
    }

    @Transactional
    fun sellerDiscontinue(current: CurrentSeller, id: UUID) {
        scope.enter(current.sellerId)
        val stored = own(current, id)
        requireCanSell(current)
        discontinue(SellerActor(current), stored)
    }

    @Transactional
    fun sellerCustomizations(current: CurrentSeller, id: UUID, body: Map<String, Any?>): List<Map<String, Any?>> {
        scope.enter(current.sellerId)
        val stored = own(current, id)
        requireCanSell(current)
        return replaceCustomizations(SellerActor(current), stored, body["customizations"])
    }

    @Transactional(readOnly = true)
    fun sellerVariants(current: CurrentSeller, productId: UUID): List<Map<String, Any?>> {
        scope.enter(current.sellerId)
        own(current, productId)
        return repo.variants(productId)
    }

    @Transactional
    fun sellerAddVariant(current: CurrentSeller, productId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        scope.enter(current.sellerId)
        val product = own(current, productId)
        requireCanSell(current)
        return addVariant(SellerActor(current), product, body, allowDefault = false)
    }

    @Transactional
    fun sellerUpdateVariant(current: CurrentSeller, productId: UUID, variantId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        scope.enter(current.sellerId)
        val product = own(current, productId)
        requireCanSell(current)
        return updateVariant(SellerActor(current), product, variantId, body, allowDefault = false)
    }

    @Transactional
    fun sellerDeleteVariant(current: CurrentSeller, productId: UUID, variantId: UUID) {
        scope.enter(current.sellerId)
        val product = own(current, productId)
        requireCanSell(current)
        deleteVariant(SellerActor(current), product, variantId)
    }

    /** Manufacturer, packer, importer and origin from the caller's latest listing, so they are not retyped. */
    @Transactional(readOnly = true)
    fun lastBusinessDetails(current: CurrentSeller): Map<String, Any?>? {
        scope.enter(current.sellerId)
        return jdbc.sql(
            """
            select manufacturer_details, packer_details, importer_details, countries_of_origin, brand_id, hsn
            from product where seller_id = :s and manufacturer_details is not null order by updated_at desc limit 1
            """.trimIndent(),
        ).param("s", current.sellerId).query { rs, _ ->
            mapOf<String, Any?>(
                "manufacturerDetails" to rs.getString("manufacturer_details"), "packerDetails" to rs.getString("packer_details"),
                "importerDetails" to rs.getString("importer_details"),
                "countriesOfOrigin" to ((rs.getArray("countries_of_origin")?.array as? Array<*>)?.map { it.toString() } ?: emptyList()),
                "brandId" to rs.getString("brand_id"), "hsn" to rs.getString("hsn"),
            )
        }.optional().orElse(null)
    }

    /** The product, if it is this seller's. Someone else's is not found, never forbidden. */
    private fun own(current: CurrentSeller, id: UUID): MutableMap<String, Any?> {
        val product = repo.product(id) ?: throw NotFoundException("Product not found")
        if (product["sellerId"] != current.sellerId.toString()) throw NotFoundException("Product not found")
        return product
    }

    private fun requireCanSell(current: CurrentSeller) {
        if (current.canSell) return
        throw ApiException(HttpStatus.FORBIDDEN, sellingBlockedReason(current.status))
    }

    // ================================================================ staff

    @Transactional(readOnly = true)
    fun adminGet(id: UUID): Map<String, Any?> = views.detail(repo.product(id) ?: throw NotFoundException("Product not found"), includePrivate = true)

    @Transactional
    fun adminCreate(adminId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val sellerId = resolveSeller(body) ?: PlatformSeller.ID
        return create(StaffActor(adminId), sellerId, body)
    }

    @Transactional
    fun adminUpdate(adminId: UUID, id: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val stored = repo.product(id) ?: throw NotFoundException("Product not found")
        val (product, _) = update(StaffActor(adminId), stored, body, newSeller = resolveSeller(body))
        return product
    }

    @Transactional
    fun adminDiscontinue(adminId: UUID, id: UUID): Map<String, Any?> {
        val stored = repo.product(id) ?: throw NotFoundException("Product not found")
        discontinue(StaffActor(adminId), stored)
        return repo.product(id)!!
    }

    @Transactional
    fun adminFeatured(adminId: UUID, id: UUID, featured: Boolean?): Map<String, Any?> {
        if (featured == null) throw BadRequestException("isFeatured must be a boolean")
        val stored = repo.product(id) ?: throw NotFoundException("Product not found")
        repo.updateProduct(id, mapOf("isFeatured" to featured))
        audit.record("admin", adminId, "UPDATE", "product.featured", id.toString(), mapOf("isFeatured" to stored["isFeatured"]), mapOf("isFeatured" to featured))
        announce(id, ProductChange.UPDATED)
        return repo.product(id)!!
    }

    @Transactional
    fun adminCustomizations(adminId: UUID, id: UUID, body: Map<String, Any?>): List<Map<String, Any?>> =
        replaceCustomizations(StaffActor(adminId), repo.product(id) ?: throw NotFoundException("Product not found"), body["customizations"])

    /** Replace the quantity-break tiers; the per-unit price is derived from the discount, never typed twice. */
    @Transactional
    fun adminBulkPricing(adminId: UUID, id: UUID, body: Map<String, Any?>): List<Map<String, Any?>> {
        val product = repo.product(id) ?: throw NotFoundException("Product not found")
        val (tiers, errors) = ProductInput.parseTiers(body["tiers"])
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))
        val price = (product["pricePaise"] as Number).toLong()
        jdbc.sql("delete from bulk_pricing where product_id = :p").param("p", id).update()
        for (tier in tiers) {
            jdbc.sql("insert into bulk_pricing (id, product_id, min_qty, max_qty, discount_bp, price_paise) values (:id, :p, :min, :max, :d, :price)")
                .param("id", Ids.newId()).param("p", id).param("min", tier.minQty).param("max", tier.maxQty).param("d", tier.discountBp)
                .param("price", com.tailorae.common.Paise(price).minus(com.tailorae.common.Paise(price).percentBp(tier.discountBp)).value)
                .update()
        }
        repo.updateProduct(id, mapOf("allowBulkOrders" to tiers.isNotEmpty()))
        audit.record("admin", adminId, "UPDATE", "product.bulk_pricing", id.toString(), after = tiers)
        announce(id, ProductChange.UPDATED)
        return repo.bulkPricings(id)
    }

    @Transactional(readOnly = true)
    fun adminVariants(productId: UUID): List<Map<String, Any?>> {
        repo.product(productId) ?: throw NotFoundException("Product not found")
        return repo.variants(productId)
    }

    @Transactional
    fun adminAddVariant(adminId: UUID, productId: UUID, body: Map<String, Any?>) =
        addVariant(StaffActor(adminId), repo.product(productId) ?: throw NotFoundException("Product not found"), body, allowDefault = true)

    @Transactional
    fun adminUpdateVariant(adminId: UUID, productId: UUID, variantId: UUID, body: Map<String, Any?>) =
        updateVariant(StaffActor(adminId), repo.product(productId) ?: throw NotFoundException("Product not found"), variantId, body, allowDefault = true)

    @Transactional
    fun adminDeleteVariant(adminId: UUID, productId: UUID, variantId: UUID) =
        deleteVariant(StaffActor(adminId), repo.product(productId) ?: throw NotFoundException("Product not found"), variantId)

    /** Set every size (or the product, when it has none) to one stock level. */
    @Transactional
    fun adminSetAllStock(adminId: UUID, productId: UUID, quantity: Any?): Int {
        val q = ProductInput.wholeNumber(quantity)?.takeIf { it in 0..100_000 }?.toInt()
            ?: throw BadRequestException("quantity must be a whole number from 0 to 100000")
        val product = repo.product(productId) ?: throw NotFoundException("Product not found")
        val variants = repo.variants(productId)
        val actor = StaffActor(adminId)
        if (variants.isEmpty()) {
            setProductQuantity(actor, product, q)
        } else {
            for (v in variants) setVariantQuantity(actor, product, v, q)
            repo.updateProduct(productId, mapOf("quantity" to q * variants.size))
        }
        audit.record("admin", adminId, "UPDATE", "product.stock", productId.toString(), after = mapOf("quantity" to q))
        announce(productId, ProductChange.STOCK)
        return q
    }

    /**
     * One action on up to 200 products. Putting products live goes through the
     * same checklist as one at a time: complete ones go live, incomplete ones
     * are named and left as they are.
     */
    @Transactional
    fun adminBulk(adminId: UUID, ids: Any?, action: Any?): Map<String, Any?> {
        val updates = mapOf(
            "activate" to mapOf("status" to "ACTIVE"), "deactivate" to mapOf("status" to "INACTIVE"),
            "discontinue" to mapOf("status" to "DISCONTINUED"), "feature" to mapOf("isFeatured" to true),
            "unfeature" to mapOf("isFeatured" to false), "approve" to mapOf("moderationStatus" to "APPROVED", "moderationNote" to null),
        )
        val change = updates[action as? String] ?: throw BadRequestException("action must be one of: ${updates.keys.joinToString(", ")}")
        if (ids !is List<*> || ids.isEmpty() || ids.any { it !is String }) throw BadRequestException("ids must be a non-empty array of product ids")
        if (ids.size > 200) throw BadRequestException("At most 200 products per bulk action")
        val uuids = ids.mapNotNull { runCatching { UUID.fromString(it as String) }.getOrNull() }
        val skipped = mutableListOf<Map<String, Any?>>()
        var count = 0
        for (product in repo.products(uuids)) {
            val id = UUID.fromString(product["id"] as String)
            if (action == "activate") {
                val snapshot = LinkedHashMap(product).apply { put("variants", repo.variants(id)) }
                val missing = ProductSpec.missingForLive(snapshot, categories.columns(product["categoryId"] as String))
                if (missing.isNotEmpty()) { skipped += mapOf("id" to product["id"], "name" to product["name"], "missing" to missing.size); continue }
            }
            repo.updateProduct(id, change, moderated = action == "approve")
            announce(id, if (action == "approve") ProductChange.MODERATED else if (action == "discontinue") ProductChange.DISCONTINUED else ProductChange.UPDATED)
            count++
        }
        audit.record("admin", adminId, "BULK_${(action as String).uppercase()}", "product", null, after = mapOf("ids" to ids, "count" to count))
        val message = "$count product${if (count == 1) "" else "s"} updated" + if (skipped.isEmpty()) "" else
            ". ${skipped.size} not put live because required listing fields are missing: ${skipped.take(5).joinToString(", ") { it["name"] as String }}${if (skipped.size > 5) "…" else ""}"
        return mapOf("count" to count, "skipped" to skipped, "message" to message)
    }

    // ================================================================ moderation

    @Transactional(readOnly = true)
    fun moderationQueue(status: String?): Map<String, Any?> {
        val wanted = if (status?.uppercase() == "REJECTED") "REJECTED" else "PENDING"
        val rows = jdbc.sql("select * from product where moderation_status = :st order by updated_at limit 100")
            .param("st", wanted).query { rs, _ -> repo.productRow(rs) }.list()
        val products = rows.map { views.detail(it, includePrivate = true) }
        val counts = jdbc.sql("select moderation_status, count(*) as n from product where moderation_status in ('PENDING','REJECTED') group by moderation_status")
            .query { rs, _ -> rs.getString(1) to rs.getLong(2) }.list().toMap()
        return mapOf("products" to products, "counts" to mapOf("pending" to (counts["PENDING"] ?: 0L), "rejected" to (counts["REJECTED"] ?: 0L)))
    }

    @Transactional
    fun moderate(adminId: UUID, id: UUID, decision: String?, note: String?): Map<String, Any?> {
        val clean = note?.trim()?.take(500)?.ifEmpty { null }
        if (decision != "approve" && decision != "reject") throw BadRequestException("decision must be \"approve\" or \"reject\"")
        if (decision == "reject" && clean == null) throw BadRequestException("Tell the seller what to fix")
        val before = repo.product(id) ?: throw NotFoundException("Product not found")
        val approve = decision == "approve"
        repo.updateProduct(id, mapOf("moderationStatus" to if (approve) "APPROVED" else "REJECTED", "moderationNote" to if (approve) null else clean), moderated = true)
        audit.record("admin", adminId, if (approve) "LISTING_APPROVE" else "LISTING_REJECT", "product", id.toString(),
            mapOf("moderationStatus" to before["moderationStatus"]), mapOf("note" to clean))
        announce(id, ProductChange.MODERATED)
        val after = repo.product(id)!!
        return mapOf("id" to after["id"], "name" to after["name"], "moderationStatus" to after["moderationStatus"], "moderationNote" to after["moderationNote"])
    }

    // ================================================================ shared write paths

    private fun create(actor: Actor, sellerId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val picked = ProductInput.pickProduct(body)
        val data = picked.data
        val errors = picked.errors
        for (field in listOf("name", "sku", "categoryId")) {
            if ((data[field] as String?).isNullOrBlank()) errors += "$field is required"
        }
        if (data["pricePaise"] == null) errors += "pricePaise is required and must be a whole number of paise"
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))

        val categoryId = data["categoryId"] as String
        if (!categories.exists(categoryId)) throw BadRequestException("categoryId does not match an existing category")
        checkBrand(actor, sellerId, data["brandId"] as String?)
        checkSkuFree(sellerId, data["sku"] as String, null)
        // Two shops will both call something "cotton-kurta": a clash gets a suffix, not a refusal.
        data["slug"] = Slugs.unique((data["slug"] as String?)?.takeIf { it.isNotBlank() } ?: data["name"] as String) { repo.slugTaken(it) }
        if (actor is SellerActor) {
            data["moderationStatus"] = "PENDING"
            data["moderationNote"] = null
        } else {
            data["moderationStatus"] = "APPROVED"
        }
        val listingErrors = ProductSpec.prepareListingWrite(data, null, categories.columns(categoryId))
        if (listingErrors.isNotEmpty()) throw BadRequestException(listingErrors.joinToString(". "))
        ColourFamilySync.product(data)
        guardCustomizable(data, null)

        val id = try {
            repo.insertProduct(sellerId, data)
        } catch (e: DuplicateKeyException) {
            throw ConflictException("That article number or URL slug is already used. Change it and save again.")
        }
        if (actor is StaffActor) jdbc.sql("update product set moderated_at = now() where id = :id").param("id", id).update()
        ensureDefaultCustomizations(id)
        ((data["quantity"] as Int?) ?: 0).takeIf { it > 0 }?.let { repo.recordMovement(sellerId, id, null, it, "STOCK_IN", "Listed", actor.id) }
        audit.record(actor.realm, actor.id, "CREATE", "product", id.toString(), after = mapOf("sku" to data["sku"], "name" to data["name"]))
        announce(id, ProductChange.CREATED)
        return views.detail(repo.product(id)!!, includePrivate = true)
    }

    /** Returns the product and whether the edit sent it back to review. */
    private fun update(actor: Actor, stored: MutableMap<String, Any?>, body: Map<String, Any?>, newSeller: UUID? = null): Pair<Map<String, Any?>, Boolean> {
        val id = UUID.fromString(stored["id"] as String)
        val picked = ProductInput.pickProduct(body)
        val data = picked.data
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        val sellerId = UUID.fromString(stored["sellerId"] as String)
        val movingTo = newSeller?.takeIf { it != sellerId }
        if (data.isEmpty() && movingTo == null) throw BadRequestException("No valid fields provided to update")

        (data["categoryId"] as String?)?.let { if (!categories.exists(it)) throw BadRequestException("categoryId does not match an existing category") }
        if (data.containsKey("brandId") && data["brandId"] != stored["brandId"]) checkBrand(actor, movingTo ?: sellerId, data["brandId"] as String?)
        (data["sku"] as String?)?.let { if (it != stored["sku"] || movingTo != null) checkSkuFree(movingTo ?: sellerId, it, id) }
        if (movingTo != null && data["sku"] == null) checkSkuFree(movingTo, stored["sku"] as String, id)
        (data["slug"] as String?)?.let { slug ->
            if (slug != stored["slug"]) data["slug"] = Slugs.unique(slug) { it != stored["slug"] && repo.slugTaken(it) }
        }

        // Only a real change counts: the form sends every field on every save.
        val changed = ProductColumns.NEEDS_REVIEW.any { field -> data.containsKey(field) && !Values.jsonEquals(data[field], stored[field]) }
        val sentBack = actor is SellerActor && changed && stored["moderationStatus"] != "PENDING"
        if (actor is SellerActor && changed) {
            data["moderationStatus"] = "PENDING"
            data["moderationNote"] = null
        }

        val snapshot = LinkedHashMap(stored).apply { put("variants", repo.variants(id)) }
        val listingErrors = ProductSpec.prepareListingWrite(data, snapshot, categories.columns((data["categoryId"] ?: stored["categoryId"]) as String))
        if (listingErrors.isNotEmpty()) throw BadRequestException(listingErrors.joinToString(". "))
        ColourFamilySync.product(data)
        guardCustomizable(data, stored)

        val previousQuantity = (stored["quantity"] as Int?) ?: 0
        try {
            repo.updateProduct(id, data)
            if (movingTo != null) {
                jdbc.sql("update product set seller_id = :s, updated_at = now() where id = :id").param("s", movingTo).param("id", id).update()
                jdbc.sql("update product_variant set seller_id = :s where product_id = :id").param("s", movingTo).param("id", id).update()
            }
        } catch (e: DuplicateKeyException) {
            throw ConflictException("That article number or URL slug is already used. Change it and save again.")
        }
        ensureDefaultCustomizations(id)
        (data["quantity"] as Int?)?.let { q -> stockMoved(actor, movingTo ?: sellerId, id, null, previousQuantity, q) }
        audit.record(actor.realm, actor.id, "UPDATE", "product", id.toString(),
            before = data.keys.associateWith { stored[it] }, after = data + listOfNotNull(movingTo?.let { "sellerId" to it.toString() }))
        announce(id, ProductChange.UPDATED)
        return views.detail(repo.product(id)!!, includePrivate = true) to sentBack
    }

    private fun discontinue(actor: Actor, stored: Map<String, Any?>) {
        val id = UUID.fromString(stored["id"] as String)
        repo.updateProduct(id, mapOf("status" to "DISCONTINUED"))
        audit.record(actor.realm, actor.id, "DISCONTINUE", "product", id.toString(), before = mapOf("status" to stored["status"]))
        announce(id, ProductChange.DISCONTINUED)
    }

    private fun addVariant(actor: Actor, product: Map<String, Any?>, body: Map<String, Any?>, allowDefault: Boolean): Map<String, Any?> {
        val picked = ProductInput.pickVariant(body, allowDefault)
        if ((picked.data["sku"] as String?).isNullOrBlank()) picked.errors += "sku is required"
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        val data = picked.data
        if ((data["name"] as String?).isNullOrBlank()) {
            data["name"] = listOfNotNull(data["color"] as String?, data["size"] as String?).joinToString(" - ").ifEmpty { product["name"] as String }
        }
        ColourFamilySync.variant(data)
        val productId = UUID.fromString(product["id"] as String)
        val sellerId = UUID.fromString(product["sellerId"] as String)
        val id = try {
            repo.insertVariant(productId, sellerId, data)
        } catch (e: DuplicateKeyException) {
            throw ConflictException("A variant with this SKU already exists")
        }
        ((data["quantity"] as Int?) ?: 0).takeIf { it > 0 }?.let { repo.recordMovement(sellerId, productId, id, it, "STOCK_IN", "Size added", actor.id) }
        audit.record(actor.realm, actor.id, "CREATE", "product_variant", id.toString(), after = mapOf("productId" to productId, "sku" to data["sku"]))
        announce(productId, ProductChange.UPDATED)
        return repo.variant(productId, id)!!
    }

    private fun updateVariant(actor: Actor, product: Map<String, Any?>, variantId: UUID, body: Map<String, Any?>, allowDefault: Boolean): Map<String, Any?> {
        val picked = ProductInput.pickVariant(body, allowDefault)
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        if (picked.data.isEmpty()) throw BadRequestException("No valid fields provided to update")
        val productId = UUID.fromString(product["id"] as String)
        // Scoped to the product in the path, which is itself scoped to the caller.
        val existing = repo.variant(productId, variantId) ?: throw NotFoundException("Size not found")
        val data = picked.data
        ColourFamilySync.variant(data)
        try {
            repo.updateVariant(variantId, data)
        } catch (e: DuplicateKeyException) {
            throw ConflictException("A variant with this SKU already exists")
        }
        (data["quantity"] as Int?)?.let { q ->
            stockMoved(actor, UUID.fromString(product["sellerId"] as String), productId, variantId, (existing["quantity"] as Int?) ?: 0, q)
        }
        audit.record(actor.realm, actor.id, "UPDATE", "product_variant", variantId.toString(), before = data.keys.associateWith { existing[it] }, after = data)
        announce(productId, if (data.keys == setOf("quantity")) ProductChange.STOCK else ProductChange.UPDATED)
        return repo.variant(productId, variantId)!!
    }

    private fun deleteVariant(actor: Actor, product: Map<String, Any?>, variantId: UUID) {
        val productId = UUID.fromString(product["id"] as String)
        val n = try {
            jdbc.sql("delete from product_variant where id = :v and product_id = :p").param("v", variantId).param("p", productId).update()
        } catch (e: org.springframework.dao.DataIntegrityViolationException) {
            throw ConflictException("This size appears on an existing order. Set its stock to 0 instead of deleting it.")
        }
        if (n == 0) throw NotFoundException("Size not found")
        audit.record(actor.realm, actor.id, "DELETE", "product_variant", variantId.toString(), before = mapOf("productId" to productId))
        announce(productId, ProductChange.UPDATED)
    }

    private fun setProductQuantity(actor: Actor, product: Map<String, Any?>, quantity: Int) {
        val id = UUID.fromString(product["id"] as String)
        repo.updateProduct(id, mapOf("quantity" to quantity))
        stockMoved(actor, UUID.fromString(product["sellerId"] as String), id, null, (product["quantity"] as Int?) ?: 0, quantity)
    }

    private fun setVariantQuantity(actor: Actor, product: Map<String, Any?>, variant: Map<String, Any?>, quantity: Int) {
        val variantId = UUID.fromString(variant["id"] as String)
        repo.updateVariant(variantId, mapOf("quantity" to quantity))
        stockMoved(actor, UUID.fromString(product["sellerId"] as String), UUID.fromString(product["id"] as String), variantId,
            (variant["quantity"] as Int?) ?: 0, quantity)
    }

    /** Every stock change is a movement; a crossing from none to some is what back-in-stock waits for. */
    private fun stockMoved(actor: Actor, sellerId: UUID, productId: UUID, variantId: UUID?, before: Int, after: Int) {
        if (before == after) return
        repo.recordMovement(sellerId, productId, variantId, after - before, if (after > before) "STOCK_IN" else "ADJUSTMENT", null, actor.id)
        if (before <= 0 && after > 0) {
            outbox.record(CatalogTopics.STOCK_CHANGED, productId.toString(), StockChanged(productId, variantId, sellerId, before, after))
        }
    }

    private fun replaceCustomizations(actor: Actor, product: Map<String, Any?>, raw: Any?): List<Map<String, Any?>> {
        val (rows, errors) = ProductInput.parseCustomizations(raw)
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))
        val id = UUID.fromString(product["id"] as String)
        if (rows.isNotEmpty() && !categories.isClothing(product["articleType"] as String?, product["categoryId"] as String?)) {
            throw BadRequestException("Printing and embroidery can only be offered on clothing")
        }
        jdbc.sql("delete from product_customization where product_id = :p").param("p", id).update()
        rows.forEach { insertCustomization(id, it) }
        repo.updateProduct(id, mapOf("isCustomizable" to rows.isNotEmpty()))
        audit.record(actor.realm, actor.id, "UPDATE", "product.customizations", id.toString(), after = rows)
        announce(id, ProductChange.UPDATED)
        return repo.customizations(id)
    }

    private fun insertCustomization(productId: UUID, row: ProductInput.CustomizationRow) {
        jdbc.sql(
            """
            insert into product_customization (id, product_id, name, type, is_required, options, additional_paise, max_characters)
            values (:id, :p, :name, :type, :req, cast(:options as jsonb), :cost, :max)
            """.trimIndent(),
        ).param("id", Ids.newId()).param("p", productId).param("name", row.name).param("type", row.type).param("req", row.isRequired)
            .param("options", row.options?.let(json::writeValueAsString)).param("cost", row.additionalPaise).param("max", row.maxCharacters)
            .update()
    }

    /** A non-clothing product cannot be customizable: switched off rather than refused (the form hides the switch). */
    private fun guardCustomizable(data: MutableMap<String, Any?>, stored: Map<String, Any?>?) {
        val wants = (data["isCustomizable"] ?: stored?.get("isCustomizable")) == true
        if (!wants) return
        val articleType = (if (data.containsKey("articleType")) data["articleType"] else stored?.get("articleType")) as String?
        val categoryId = (data["categoryId"] ?: stored?.get("categoryId")) as String?
        if (!categories.isClothing(articleType, categoryId)) data["isCustomizable"] = false
    }

    /** A customizable product with no options gets the defaults, so the page has something to offer. */
    private fun ensureDefaultCustomizations(id: UUID) {
        val needs = jdbc.sql("select is_customizable and not exists (select 1 from product_customization c where c.product_id = p.id) from product p where p.id = :id")
            .param("id", id).query(Boolean::class.javaObjectType).single()
        if (!needs) return
        insertCustomization(id, ProductInput.CustomizationRow("Text to print", "TEXT", false, null, 0, 30))
        insertCustomization(id, ProductInput.CustomizationRow("Embroidery text", "EMBROIDERY", false, null, 0, 20))
    }

    private fun checkBrand(actor: Actor, sellerId: UUID, brandId: String?) {
        if (brandId == null) return
        val id = UUID.fromString(brandId)
        if (!brands.exists(id)) throw BadRequestException("brandId does not match an existing brand")
        if (actor is SellerActor && !brands.sellerMayUse(sellerId, id)) {
            throw ApiException(HttpStatus.FORBIDDEN, "Your shop is not approved to sell that brand yet. Register it under Brands with your proof, or list without a brand.")
        }
    }

    private fun checkSkuFree(sellerId: UUID, sku: String, except: UUID?) {
        val holder = jdbc.sql("select id, name, status from product where seller_id = :s and lower(sku) = lower(:sku) and id is distinct from :except")
            .param("s", sellerId).param("sku", sku.trim()).param("except", except)
            .query { rs, _ -> Triple(rs.getString("id"), rs.getString("name"), rs.getString("status")) }.optional().orElse(null) ?: return
        throw ConflictException(
            if (holder.third == "DISCONTINUED") "Article number $sku belongs to “${holder.second}”, which was deleted. Deleted listings keep their article number — open it and set its status back to Draft to list it again."
            else "Article number $sku is already used by your listing “${holder.second}”.",
        )
    }

    private fun resolveSeller(body: Map<String, Any?>): UUID? {
        val raw = (body["sellerId"] ?: body["vendorId"]) ?: return null
        if (raw == "" || raw == "house") return PlatformSeller.ID
        val id = (raw as? String)?.let { runCatching { UUID.fromString(it) }.getOrNull() } ?: throw BadRequestException("sellerId does not match an existing seller")
        val exists = jdbc.sql("select exists (select 1 from seller where id = :id)").param("id", id).query(Boolean::class.javaObjectType).single()
        if (!exists) throw BadRequestException("sellerId does not match an existing seller")
        return id
    }

    private fun announce(id: UUID, change: ProductChange) {
        val row = jdbc.sql("select seller_id, slug, status, moderation_status from product where id = :id").param("id", id)
            .query { rs, _ -> ProductChanged(id, rs.getObject("seller_id", UUID::class.java), rs.getString("slug"), change, rs.getString("status"), rs.getString("moderation_status")) }
            .optional().orElse(null) ?: return
        outbox.record(CatalogTopics.PRODUCT_CHANGED, id.toString(), row)
    }

    companion object {
        /** Why this shop may not list or change products yet; each answer says what happens next. */
        fun sellingBlockedReason(status: SellerStatus): String = when (status) {
            SellerStatus.APPROVED -> ""
            SellerStatus.SUBMITTED, SellerStatus.UNDER_REVIEW ->
                "Your seller application is still being reviewed. You can list products once it is approved."
            SellerStatus.REJECTED -> "Your seller application was not approved. Update your details and contact us to be reconsidered."
            SellerStatus.SUSPENDED -> "Your shop is suspended. Contact us to have it reinstated."
            else -> "Your seller application has not been approved yet. Finish and submit it to start listing."
        }
    }
}
