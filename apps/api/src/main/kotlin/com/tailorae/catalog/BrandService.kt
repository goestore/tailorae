package com.tailorae.catalog

import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.SellerScope
import com.tailorae.common.Slugs
import com.tailorae.common.storage.Bucket
import com.tailorae.common.storage.ObjectStorage
import com.tailorae.seller.CurrentSeller
import com.tailorae.seller.DocumentTypes
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.util.UUID

enum class AuthorizationType { OWNER, AUTHORISED_RESELLER }

/**
 * Brands, and which sellers may list under them (`seller_brand`).
 *
 * A brand is shared: many shops may sell it once each is authorised — as the
 * trademark owner or an authorised reseller, with the proof in the PRIVATE
 * bucket. MODERATOR staff review both the brand and each authorisation. A
 * seller may only put a brand on a listing once its authorisation is APPROVED.
 */
@Service
class BrandService(
    private val jdbc: JdbcClient,
    private val scope: SellerScope,
    private val storage: ObjectStorage,
    private val audit: Audit,
) {
    // ------------------------------------------------------------ rule used by product writes

    /** True when this seller holds an APPROVED authorisation for the brand. Runs inside the seller's scope. */
    internal fun sellerMayUse(sellerId: UUID, brandId: UUID): Boolean =
        jdbc.sql(
            """
            select exists (select 1 from seller_brand sb join brand b on b.id = sb.brand_id
                           where sb.seller_id = :s and sb.brand_id = :b and sb.status = 'APPROVED' and b.status <> 'REJECTED')
            """.trimIndent(),
        ).param("s", sellerId).param("b", brandId).query(Boolean::class.javaObjectType).single()

    internal fun exists(brandId: UUID): Boolean =
        jdbc.sql("select exists (select 1 from brand where id = :b)").param("b", brandId).query(Boolean::class.javaObjectType).single()

    // ------------------------------------------------------------ seller

    @Transactional(readOnly = true)
    fun sellerBrands(current: CurrentSeller): List<Map<String, Any?>> {
        scope.enter(current.sellerId)
        return jdbc.sql(
            """
            select b.*, sb.authorization_type, sb.status as authorization_status, sb.rejection_reason as authorization_reason,
                   sb.document_key is not null as has_document, sb.created_at as requested_at, sb.decided_at,
                   (select count(*) from product p where p.brand_id = b.id and p.seller_id = sb.seller_id) as product_count
            from seller_brand sb join brand b on b.id = sb.brand_id
            where sb.seller_id = :s order by sb.created_at desc
            """.trimIndent(),
        ).param("s", current.sellerId).query { rs, _ -> sellerBrandView(rs) }.list()
    }

    /**
     * Register (or resubmit) the caller's authorisation for a brand, creating the
     * brand when nobody has registered it yet. Resubmitting replaces the proof.
     */
    @Transactional
    fun register(
        current: CurrentSeller, name: String?, type: AuthorizationType?, description: String?, logo: String?,
        filename: String?, content: ByteArray?,
    ): Pair<Map<String, Any?>, Boolean> {
        scope.enter(current.sellerId)
        val errors = mutableListOf<String>()
        val clean = name?.trim()?.replace(Regex("\\s+"), " ")?.take(80) ?: ""
        if (clean.length < 2) errors += "Enter the brand name (at least 2 characters)"
        if (type == null) errors += "Say whether you own the trademark or are an authorised reseller"
        if (content == null || content.isEmpty()) {
            errors += if (type == AuthorizationType.AUTHORISED_RESELLER) "Upload the authorised-reseller letter from the brand owner"
            else "Upload your trademark registration certificate"
        }
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))
        if (content!!.size > MAX_DOCUMENT_BYTES) throw BadRequestException("Documents must be 8 MB or smaller")
        val contentType = DocumentTypes.sniff(content) ?: throw BadRequestException("Upload a PDF, JPG, PNG or WebP file")

        val existing = brandByName(clean)
        if (existing != null) {
            val owner = existing["ownerSellerId"] as String?
            if (type == AuthorizationType.OWNER && owner != null && owner != current.sellerId.toString()) {
                throw ConflictException("That brand is already registered on TAILORAE by its owner. Apply as an authorised reseller, or contact us if it is yours.")
            }
            if (existing["status"] == "REJECTED" && owner != null && owner != current.sellerId.toString()) {
                throw ConflictException("That brand name cannot be used. Contact us if the brand is yours.")
            }
        }
        val brandId = existing?.let { UUID.fromString(it["id"] as String) } ?: createBrand(clean, description, logo, current.sellerId.takeIf { type == AuthorizationType.OWNER })
        val authorization = jdbc.sql("select status, document_key from seller_brand where seller_id = :s and brand_id = :b")
            .param("s", current.sellerId).param("b", brandId)
            .query { rs, _ -> rs.getString("status") to rs.getString("document_key") }.optional().orElse(null)
        if (authorization?.first == "APPROVED") throw ConflictException("That brand is already approved for your shop")

        val stored = storage.put(Bucket.PRIVATE, "brand-authorizations/${current.sellerId}", filename ?: "document", contentType, content)
        jdbc.sql(
            """
            insert into seller_brand (seller_id, brand_id, authorization_type, document_key, status)
            values (:s, :b, :t, :k, 'PENDING')
            on conflict (seller_id, brand_id) do update set authorization_type = excluded.authorization_type,
                document_key = excluded.document_key, status = 'PENDING', rejection_reason = null, decided_at = null, created_at = now()
            """.trimIndent(),
        ).param("s", current.sellerId).param("b", brandId).param("t", type!!.name).param("k", stored.key).update()
        if (type == AuthorizationType.OWNER && existing != null && existing["ownerSellerId"] == null) {
            jdbc.sql("update brand set owner_seller_id = :s, updated_at = now() where id = :b and owner_seller_id is null")
                .param("s", current.sellerId).param("b", brandId).update()
        }
        // A replaced proof is not kept around.
        authorization?.second?.let { storage.delete(Bucket.PRIVATE, it) }
        audit.record("seller", current.accountId, if (authorization != null) "RESUBMIT" else "CREATE", "seller_brand", "${current.sellerId}/$brandId",
            after = mapOf("brand" to clean, "authorizationType" to type.name))
        return sellerBrands(current).first { it["id"] == brandId.toString() } to (authorization == null)
    }

    /** Quick add from the listing form: asks for the brand without proof yet; it can be listed under once approved. */
    @Transactional
    fun quickAdd(current: CurrentSeller, name: String?): Pair<Map<String, Any?>, Boolean> {
        scope.enter(current.sellerId)
        val clean = name?.trim()?.replace(Regex("\\s+"), " ")?.take(80) ?: ""
        if (clean.length < 2) throw BadRequestException("Enter the brand name (at least 2 characters)")
        val existing = brandByName(clean)
        if (existing != null && existing["status"] == "REJECTED") throw ConflictException("That brand name cannot be used. Contact us if the brand is yours.")
        val brandId = existing?.let { UUID.fromString(it["id"] as String) } ?: createBrand(clean, null, null, current.sellerId)
        val created = jdbc.sql(
            """
            insert into seller_brand (seller_id, brand_id, authorization_type, status)
            values (:s, :b, :t, 'PENDING') on conflict (seller_id, brand_id) do nothing
            """.trimIndent(),
        ).param("s", current.sellerId).param("b", brandId)
            .param("t", if (existing == null) AuthorizationType.OWNER.name else AuthorizationType.AUTHORISED_RESELLER.name).update() == 1
        return sellerBrands(current).first { it["id"] == brandId.toString() } to (existing == null && created)
    }

    /** Brands for the listing form: every brand the shop has asked for, with whether it may be used yet. */
    @Transactional(readOnly = true)
    fun listingFormBrands(current: CurrentSeller): List<Map<String, Any?>> =
        sellerBrands(current).map {
            mapOf("id" to it["id"], "name" to it["name"], "slug" to it["slug"], "isActive" to it["isActive"],
                "authorizationStatus" to it["authorizationStatus"], "usable" to (it["authorizationStatus"] == "APPROVED" && it["status"] != "REJECTED"))
        }.sortedBy { (it["name"] as String).lowercase() }

    @Transactional(readOnly = true)
    fun sellerDocumentUrl(current: CurrentSeller, brandId: UUID): String {
        scope.enter(current.sellerId)
        val key = jdbc.sql("select document_key from seller_brand where seller_id = :s and brand_id = :b")
            .param("s", current.sellerId).param("b", brandId).query(String::class.java).optional().orElse(null)
            ?: throw NotFoundException("Document not found")
        return storage.signedUrl(key)
    }

    private fun brandByName(name: String): Map<String, Any?>? =
        jdbc.sql("select * from brand where lower(name) = lower(:n)").param("n", name).query { rs, _ -> brandView(rs) }.optional().orElse(null)

    private fun createBrand(name: String, description: String?, logo: String?, owner: UUID?): UUID {
        val id = Ids.newId()
        val slug = Slugs.unique(name) { candidate ->
            jdbc.sql("select exists (select 1 from brand where slug = :s)").param("s", candidate).query(Boolean::class.javaObjectType).single()
        }
        try {
            jdbc.sql(
                """
                insert into brand (id, name, slug, description, logo, owner_seller_id, status, is_active)
                values (:id, :n, :slug, :d, :logo, :owner, 'PENDING', false)
                """.trimIndent(),
            ).param("id", id).param("n", name).param("slug", slug).param("d", description?.trim()?.take(2000)?.ifEmpty { null })
                .param("logo", logo?.trim()?.take(2000)?.ifEmpty { null }).param("owner", owner).update()
        } catch (e: DuplicateKeyException) {
            throw ConflictException("That brand name is already taken")
        }
        return id
    }

    // ------------------------------------------------------------ staff

    @Transactional(readOnly = true)
    fun adminList(): List<Map<String, Any?>> =
        jdbc.sql(
            """
            select b.*, (select count(*) from product p where p.brand_id = b.id) as product_count,
                   (select count(*) from seller_brand sb where sb.brand_id = b.id and sb.status = 'PENDING') as pending_authorizations,
                   s.shop_name as owner_shop_name, s.status as owner_status
            from brand b left join seller s on s.id = b.owner_seller_id
            order by b.display_order, b.name
            """.trimIndent(),
        ).query { rs, _ ->
            brandView(rs) + mapOf(
                "_count" to mapOf("products" to rs.getLong("product_count")),
                "pendingAuthorizations" to rs.getLong("pending_authorizations"),
                "ownerSeller" to rs.getString("owner_seller_id")?.let { mapOf("id" to it, "shopName" to rs.getString("owner_shop_name"), "status" to rs.getString("owner_status")) },
            )
        }.list()

    @Transactional
    fun adminCreate(adminId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val picked = ProductInput.pickBrand(body)
        if (picked.data["name"] == null) picked.errors += "name is required"
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        val d = picked.data
        val id = Ids.newId()
        val slug = (d["slug"] as String?)?.takeIf { it.isNotBlank() } ?: Slugs.slugify(d["name"] as String)
        try {
            jdbc.sql(
                """
                insert into brand (id, name, slug, description, logo, banner, is_featured, is_active, display_order, status, meta_title, meta_description)
                values (:id, :name, :slug, :description, :logo, :banner, :featured, :active, :order, 'APPROVED', :mt, :md)
                """.trimIndent(),
            ).param("id", id).param("name", d["name"]).param("slug", slug).param("description", d["description"])
                .param("logo", d["logo"]).param("banner", d["banner"]).param("featured", d["isFeatured"] ?: false)
                .param("active", d["isActive"] ?: true).param("order", d["displayOrder"] ?: 0)
                .param("mt", d["metaTitle"]).param("md", d["metaDescription"]).update()
        } catch (e: DuplicateKeyException) {
            throw ConflictException("A brand with this name or slug already exists")
        }
        audit.record("admin", adminId, "CREATE", "brand", id.toString(), after = d)
        return brand(id)
    }

    @Transactional
    fun adminUpdate(adminId: UUID, id: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val before = brand(id)
        val picked = ProductInput.pickBrand(body)
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        if (picked.data.isEmpty()) throw BadRequestException("No valid fields provided to update")
        // A seller-registered brand goes live only through review, which checks its proof.
        if (picked.data["isActive"] == true && before["status"] != "APPROVED") {
            throw ConflictException("Approve this brand in its review panel before activating it")
        }
        val columns = mapOf("name" to "name", "slug" to "slug", "description" to "description", "logo" to "logo", "banner" to "banner",
            "metaTitle" to "meta_title", "metaDescription" to "meta_description", "isActive" to "is_active", "isFeatured" to "is_featured",
            "displayOrder" to "display_order")
        val keys = picked.data.keys.filter { it in columns }
        var spec = jdbc.sql("update brand set ${keys.joinToString(", ") { "${columns.getValue(it)} = :$it" }}, updated_at = now() where id = :id").param("id", id)
        for (k in keys) spec = spec.param(k, picked.data[k])
        try {
            spec.update()
        } catch (e: DuplicateKeyException) {
            throw ConflictException("A brand with this name or slug already exists")
        }
        audit.record("admin", adminId, "UPDATE", "brand", id.toString(), before = before, after = picked.data)
        return brand(id)
    }

    /** Deactivates rather than deletes while products still carry it. */
    @Transactional
    fun adminDelete(adminId: UUID, id: UUID): Pair<String, Map<String, Any?>?> {
        val before = brand(id)
        val products = jdbc.sql("select count(*) from product where brand_id = :id").param("id", id).query(Long::class.javaObjectType).single()
        if (products > 0) {
            jdbc.sql("update brand set is_active = false, updated_at = now() where id = :id").param("id", id).update()
            audit.record("admin", adminId, "DEACTIVATE", "brand", id.toString(), before = before)
            return "Deactivated — $products product(s) still carry this brand" to brand(id)
        }
        jdbc.sql("delete from brand where id = :id").param("id", id).update()
        audit.record("admin", adminId, "DELETE", "brand", id.toString(), before = before)
        return "Brand removed" to null
    }

    /**
     * Approve or reject a brand, or — with [sellerId] — one seller's
     * authorisation for it. Approving an authorisation also approves a brand
     * that was still pending; deciding the brand decides its owner's pending
     * authorisation with it.
     */
    @Transactional
    fun review(adminId: UUID, id: UUID, decision: String?, reason: String?, sellerId: UUID?): Map<String, Any?> {
        val note = reason?.trim()?.take(500)?.ifEmpty { null }
        if (decision != "approve" && decision != "reject") throw BadRequestException("decision must be \"approve\" or \"reject\"")
        if (decision == "reject" && note == null) throw BadRequestException("Tell the seller why the brand was rejected")
        val before = brand(id)
        val approve = decision == "approve"
        val authorizedSeller = sellerId ?: (before["ownerSellerId"] as String?)?.let(UUID::fromString)
        if (sellerId != null) {
            val n = jdbc.sql("update seller_brand set status = :st, rejection_reason = :r, decided_at = now() where seller_id = :s and brand_id = :b")
                .param("st", if (approve) "APPROVED" else "REJECTED").param("r", if (approve) null else note)
                .param("s", sellerId).param("b", id).update()
            if (n == 0) throw NotFoundException("That shop has not asked to sell this brand")
            if (approve && before["status"] != "APPROVED") setBrandStatus(id, true, null)
        } else {
            setBrandStatus(id, approve, note)
            if (authorizedSeller != null) {
                jdbc.sql("update seller_brand set status = :st, rejection_reason = :r, decided_at = now() where seller_id = :s and brand_id = :b and status = 'PENDING'")
                    .param("st", if (approve) "APPROVED" else "REJECTED").param("r", if (approve) null else note)
                    .param("s", authorizedSeller).param("b", id).update()
            }
        }
        audit.record("admin", adminId, if (approve) "BRAND_APPROVE" else "BRAND_REJECT", "brand", id.toString(),
            before = mapOf("status" to before["status"]), after = mapOf("sellerId" to sellerId, "reason" to note))
        return brand(id)
    }

    private fun setBrandStatus(id: UUID, approve: Boolean, note: String?) {
        jdbc.sql("update brand set status = :st, is_active = :active, rejection_reason = :r, updated_at = now() where id = :id")
            .param("st", if (approve) "APPROVED" else "REJECTED").param("active", approve).param("r", if (approve) null else note)
            .param("id", id).update()
    }

    @Transactional(readOnly = true)
    fun authorizations(status: String?): List<Map<String, Any?>> {
        val wanted = status?.uppercase()?.takeIf { it in setOf("PENDING", "APPROVED", "REJECTED") } ?: "PENDING"
        return jdbc.sql(
            """
            select sb.*, b.name as brand_name, b.slug as brand_slug, b.status as brand_status, s.shop_name, s.shop_slug, s.status as seller_status
            from seller_brand sb join brand b on b.id = sb.brand_id join seller s on s.id = sb.seller_id
            where sb.status = :st order by sb.created_at
            """.trimIndent(),
        ).param("st", wanted).query { rs, _ ->
            linkedMapOf<String, Any?>(
                "brand" to mapOf("id" to rs.getString("brand_id"), "name" to rs.getString("brand_name"), "slug" to rs.getString("brand_slug"), "status" to rs.getString("brand_status")),
                "seller" to mapOf("id" to rs.getString("seller_id"), "shopName" to rs.getString("shop_name"), "shopSlug" to rs.getString("shop_slug"), "status" to rs.getString("seller_status")),
                "authorizationType" to rs.getString("authorization_type"), "status" to rs.getString("status"),
                "rejectionReason" to rs.getString("rejection_reason"), "hasDocument" to (rs.getString("document_key") != null),
                "createdAt" to rs.getTimestamp("created_at").toInstant(), "decidedAt" to rs.getTimestamp("decided_at")?.toInstant(),
            )
        }.list()
    }

    @Transactional(readOnly = true)
    fun adminDocumentUrl(brandId: UUID, sellerId: UUID?): String {
        val owner = sellerId ?: (brand(brandId)["ownerSellerId"] as String?)?.let(UUID::fromString) ?: throw NotFoundException("Document not found")
        val key = jdbc.sql("select document_key from seller_brand where seller_id = :s and brand_id = :b")
            .param("s", owner).param("b", brandId).query(String::class.java).optional().orElse(null) ?: throw NotFoundException("Document not found")
        return storage.signedUrl(key)
    }

    fun brand(id: UUID): Map<String, Any?> =
        jdbc.sql("select * from brand where id = :id").param("id", id).query { rs, _ -> brandView(rs) }.optional()
            .orElseThrow { NotFoundException("Brand not found") }

    // ------------------------------------------------------------ mapping

    private fun brandView(rs: ResultSet): Map<String, Any?> = linkedMapOf(
        "id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug"),
        "description" to rs.getString("description"), "logo" to rs.getString("logo"), "banner" to rs.getString("banner"),
        "isFeatured" to rs.getBoolean("is_featured"), "isActive" to rs.getBoolean("is_active"), "displayOrder" to rs.getInt("display_order"),
        "ownerSellerId" to rs.getString("owner_seller_id"), "status" to rs.getString("status"), "rejectionReason" to rs.getString("rejection_reason"),
        "metaTitle" to rs.getString("meta_title"), "metaDescription" to rs.getString("meta_description"),
        "createdAt" to rs.getTimestamp("created_at").toInstant(), "updatedAt" to rs.getTimestamp("updated_at").toInstant(),
    )

    private fun sellerBrandView(rs: ResultSet): Map<String, Any?> = brandView(rs) + mapOf(
        "authorizationType" to rs.getString("authorization_type"), "authorizationStatus" to rs.getString("authorization_status"),
        "authorizationRejectionReason" to rs.getString("authorization_reason"), "hasDocument" to rs.getBoolean("has_document"),
        "requestedAt" to rs.getTimestamp("requested_at").toInstant(), "decidedAt" to rs.getTimestamp("decided_at")?.toInstant(),
        "_count" to mapOf("products" to rs.getLong("product_count")),
    )

    companion object {
        const val MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
    }
}
