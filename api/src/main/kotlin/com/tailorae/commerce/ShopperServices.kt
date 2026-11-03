package com.tailorae.commerce

import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

// ================================================================ addresses

data class AddressRequest(
    val label: String = "HOME",
    @field:NotBlank @field:Size(max = 120) val fullName: String,
    @field:NotBlank @field:Pattern(regexp = "^\\+?[0-9 ]{10,16}$", message = "must be a valid phone number") val phone: String,
    @field:Email val email: String? = null,
    @field:NotBlank @field:Size(max = 200) val line1: String,
    @field:Size(max = 200) val line2: String? = null,
    @field:NotBlank @field:Size(max = 80) val city: String,
    @field:NotBlank @field:Size(max = 80) val state: String,
    @field:NotBlank @field:Pattern(regexp = "^[1-9][0-9]{5}$", message = "must be a 6-digit PIN code") val postalCode: String,
    val country: String = "IN",
    val gstin: String? = null,
    val isDefault: Boolean = false,
)

data class AddressView(
    val id: UUID, val label: String, val fullName: String, val phone: String, val email: String?,
    val line1: String, val line2: String?, val city: String, val state: String, val postalCode: String,
    val country: String, val gstin: String?, val isDefault: Boolean,
)

@Service
class AddressService(private val jdbc: JdbcClient) {

    fun list(customerId: UUID): List<AddressView> =
        jdbc.sql("select * from customer_address where customer_id = :c order by is_default desc, created_at")
            .param("c", customerId).query { rs, _ -> view(rs) }.list()

    fun get(customerId: UUID, id: UUID): AddressView =
        jdbc.sql("select * from customer_address where id = :id and customer_id = :c").param("id", id).param("c", customerId)
            .query { rs, _ -> view(rs) }.optional().orElseThrow { NotFoundException("Address not found") }

    @Transactional
    fun create(customerId: UUID, req: AddressRequest): AddressView {
        val count = jdbc.sql("select count(*) from customer_address where customer_id = :c").param("c", customerId).query(Long::class.javaObjectType).single()
        if (count >= 20) throw ConflictException("You can save up to 20 addresses")
        // The first address is the default whatever was asked.
        val makeDefault = req.isDefault || count == 0L
        if (makeDefault) clearDefault(customerId)
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into customer_address (id, customer_id, label, full_name, phone, email, line1, line2, city, state, postal_code, country, gstin, is_default)
            values (:id, :c, :label, :name, :phone, :email, :l1, :l2, :city, :state, :pin, :country, :gstin, :def)
            """.trimIndent(),
        ).bind(req).param("id", id).param("c", customerId).param("def", makeDefault).update()
        return get(customerId, id)
    }

    @Transactional
    fun update(customerId: UUID, id: UUID, req: AddressRequest): AddressView {
        get(customerId, id)
        if (req.isDefault) clearDefault(customerId)
        jdbc.sql(
            """
            update customer_address set label = :label, full_name = :name, phone = :phone, email = :email, line1 = :l1, line2 = :l2,
                city = :city, state = :state, postal_code = :pin, country = :country, gstin = :gstin,
                is_default = (is_default or :def), updated_at = now()
            where id = :id and customer_id = :c
            """.trimIndent(),
        ).bind(req).param("id", id).param("c", customerId).param("def", req.isDefault).update()
        return get(customerId, id)
    }

    @Transactional
    fun delete(customerId: UUID, id: UUID) {
        val wasDefault = get(customerId, id).isDefault
        jdbc.sql("delete from customer_address where id = :id and customer_id = :c").param("id", id).param("c", customerId).update()
        if (wasDefault) {
            jdbc.sql(
                "update customer_address set is_default = true where id = (select id from customer_address where customer_id = :c order by created_at limit 1)",
            ).param("c", customerId).update()
        }
    }

    private fun clearDefault(customerId: UUID) {
        jdbc.sql("update customer_address set is_default = false where customer_id = :c and is_default").param("c", customerId).update()
    }

    private fun JdbcClient.StatementSpec.bind(req: AddressRequest): JdbcClient.StatementSpec {
        val label = req.label.uppercase().takeIf { it in setOf("HOME", "OFFICE", "OTHER") } ?: throw BadRequestException("label must be HOME, OFFICE or OTHER")
        return param("label", label).param("name", req.fullName.trim()).param("phone", req.phone.trim())
            .param("email", req.email?.trim()?.lowercase()).param("l1", req.line1.trim()).param("l2", req.line2?.trim())
            .param("city", req.city.trim()).param("state", req.state.trim()).param("pin", req.postalCode.trim())
            .param("country", req.country.uppercase()).param("gstin", req.gstin?.trim()?.uppercase()?.ifEmpty { null })
    }

    private fun view(rs: ResultSet) = AddressView(
        rs.getObject("id", UUID::class.java), rs.getString("label"), rs.getString("full_name"), rs.getString("phone"),
        rs.getString("email"), rs.getString("line1"), rs.getString("line2"), rs.getString("city"), rs.getString("state"),
        rs.getString("postal_code"), rs.getString("country"), rs.getString("gstin"), rs.getBoolean("is_default"),
    )
}

// ================================================================ wishlist

data class WishlistEntry(
    val productId: UUID, val name: String, val slug: String, val thumbnail: String?,
    val pricePaise: Long, val mrpPaise: Long?, val inStock: Boolean, val available: Boolean, val addedAt: Instant,
)

@Service
class WishlistService(private val jdbc: JdbcClient) {

    fun list(customerId: UUID): List<WishlistEntry> =
        jdbc.sql(
            """
            select p.id, p.name, p.slug, p.thumbnail, p.price_paise, p.mrp_paise, w.created_at,
                   (p.quantity > 0 or exists (select 1 from product_variant v where v.product_id = p.id and v.quantity > 0)) as in_stock,
                   (p.status = 'ACTIVE' and p.moderation_status = 'APPROVED' and s.status = 'APPROVED') as available
            from wishlist_item w join product p on p.id = w.product_id join seller s on s.id = p.seller_id
            where w.customer_id = :c order by w.created_at desc
            """.trimIndent(),
        ).param("c", customerId).query { rs, _ ->
            WishlistEntry(rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getString("slug"), rs.getString("thumbnail"),
                rs.getLong("price_paise"), rs.getObject("mrp_paise") as Long?, rs.getBoolean("in_stock"), rs.getBoolean("available"),
                rs.getTimestamp("created_at").toInstant())
        }.list()

    @Transactional
    fun add(customerId: UUID, productId: UUID): List<WishlistEntry> {
        val exists = jdbc.sql("select exists (select 1 from product where id = :p)").param("p", productId).query(Boolean::class.javaObjectType).single()
        if (!exists) throw NotFoundException("Product not found")
        jdbc.sql("insert into wishlist_item (customer_id, product_id) values (:c, :p) on conflict do nothing")
            .param("c", customerId).param("p", productId).update()
        return list(customerId)
    }

    @Transactional
    fun remove(customerId: UUID, productId: UUID): List<WishlistEntry> {
        jdbc.sql("delete from wishlist_item where customer_id = :c and product_id = :p").param("c", customerId).param("p", productId).update()
        return list(customerId)
    }
}

// ================================================================ coupons

data class CouponRequest(
    @field:NotBlank @field:Pattern(regexp = "^[A-Za-z0-9_-]{3,32}$", message = "3–32 letters, digits, - or _") val code: String,
    @field:Size(max = 300) val description: String? = null,
    val discountType: DiscountType,
    /** PERCENTAGE: basis points (1000 = 10%). FIXED_AMOUNT: paise. */
    @field:Min(1) val discountValue: Long,
    @field:Min(0) val minOrderPaise: Long = 0,
    val maxDiscountPaise: Long? = null,
    val usageLimit: Int? = null,
    @field:Min(0) val perCustomerLimit: Int = 1,
    val startsAt: Instant,
    val endsAt: Instant,
    val isActive: Boolean = true,
    val applicableCategoryIds: Set<UUID> = emptySet(),
    val applicableProductIds: Set<UUID> = emptySet(),
    val requireBusiness: Boolean = false,
)

data class CouponPreview(val code: String, val discountPaise: Long, val eligibleSubtotalPaise: Long?, val subtotalPaise: Long, val description: String?)

@Service
class CouponService(private val jdbc: JdbcClient, private val cart: CartService, private val audit: Audit) {

    fun find(code: String): CouponTerms? =
        jdbc.sql("select * from coupon where upper(code) = upper(:c)").param("c", code.trim()).query { rs, _ -> terms(rs) }.optional().orElse(null)

    fun customerUses(couponId: UUID, customerId: UUID): Int =
        jdbc.sql("select count(*) from coupon_redemption where coupon_id = :k and customer_id = :c")
            .param("k", couponId).param("c", customerId).query(Long::class.javaObjectType).single().toInt()

    fun isBusiness(customerId: UUID): Boolean =
        jdbc.sql("select type = 'BUSINESS' from customer where id = :c").param("c", customerId).query(Boolean::class.javaObjectType).optional().orElse(false)

    /** Prices the code against the shopper's own basket — the same check checkout repeats. */
    @Transactional(readOnly = true)
    fun preview(customerId: UUID, code: String): CouponPreview {
        val lines = cart.lines(customerId).filter { it.available }
        if (lines.isEmpty()) throw BadRequestException("Your bag is empty")
        val subtotal = lines.sumOf { it.lineTotalPaise }
        val coupon = find(code)
        val outcome = CouponRules.resolve(
            coupon, subtotal,
            CouponContext(
                isBusiness = isBusiness(customerId),
                lines = lines.map { CouponLine(it.productId, it.categoryId, it.unitPaise, it.quantity) },
                customerUses = coupon?.let { customerUses(it.id, customerId) },
            ),
        )
        if (!outcome.ok) throw com.tailorae.common.ApiException(outcome.status, outcome.error!!)
        val description = jdbc.sql("select description from coupon where id = :id").param("id", coupon!!.id).query(String::class.java).optional().orElse(null)
        return CouponPreview(coupon.code, outcome.discountPaise, outcome.eligibleSubtotalPaise, subtotal, description)
    }

    /** Records a use. Called by checkout inside the order transaction. */
    @Transactional
    fun redeem(couponId: UUID, customerId: UUID, orderId: UUID, amountPaise: Long) {
        val updated = jdbc.sql(
            "update coupon set usage_count = usage_count + 1, updated_at = now() where id = :id and (usage_limit is null or usage_count < usage_limit)",
        ).param("id", couponId).update()
        if (updated == 0) throw ConflictException("This coupon has reached its usage limit")
        jdbc.sql("insert into coupon_redemption (id, coupon_id, customer_id, order_id, amount_paise) values (:id, :k, :c, :o, :a)")
            .param("id", Ids.newId()).param("k", couponId).param("c", customerId).param("o", orderId).param("a", amountPaise).update()
    }

    // ------------------------------------------------------------ staff

    fun adminList(page: PageParams, query: String?): Page<Map<String, Any?>> {
        val filter = if (query.isNullOrBlank()) "" else "where code ilike :q or description ilike :q"
        fun <T : JdbcClient.StatementSpec> T.q(): T = apply { if (!query.isNullOrBlank()) param("q", "%${query.trim()}%") }
        val total = jdbc.sql("select count(*) from coupon $filter").q().query(Long::class.javaObjectType).single()
        val items = jdbc.sql("select * from coupon $filter order by created_at desc limit :l offset :o").q()
            .param("l", page.safeLimit).param("o", page.offset).query { rs, _ -> adminView(rs) }.list()
        return Page(items, total, page.safePage, page.safeLimit)
    }

    @Transactional
    fun save(adminId: UUID, id: UUID?, req: CouponRequest): Map<String, Any?> {
        if (!req.endsAt.isAfter(req.startsAt)) throw BadRequestException("The end date must be after the start date")
        if (req.discountType == DiscountType.PERCENTAGE && req.discountValue > 10_000) throw BadRequestException("A percentage cannot exceed 100%")
        val couponId = id ?: Ids.newId()
        val sql = if (id == null) {
            """
            insert into coupon (id, code, description, discount_type, discount_value, min_order_paise, max_discount_paise, usage_limit,
                per_customer_limit, starts_at, ends_at, is_active, applicable_category_ids, applicable_product_ids, require_business)
            values (:id, :code, :desc, :type, :value, :min, :max, :limit, :per, :starts, :ends, :active, :cats, :prods, :biz)
            """.trimIndent()
        } else {
            """
            update coupon set code = :code, description = :desc, discount_type = :type, discount_value = :value, min_order_paise = :min,
                max_discount_paise = :max, usage_limit = :limit, per_customer_limit = :per, starts_at = :starts, ends_at = :ends,
                is_active = :active, applicable_category_ids = :cats, applicable_product_ids = :prods, require_business = :biz, updated_at = now()
            where id = :id
            """.trimIndent()
        }
        val n = jdbc.sql(sql)
            .param("id", couponId).param("code", req.code.trim().uppercase()).param("desc", req.description?.trim())
            .param("type", req.discountType.name).param("value", req.discountValue).param("min", req.minOrderPaise)
            .param("max", req.maxDiscountPaise).param("limit", req.usageLimit).param("per", req.perCustomerLimit)
            .param("starts", java.sql.Timestamp.from(req.startsAt)).param("ends", java.sql.Timestamp.from(req.endsAt))
            .param("active", req.isActive).param("cats", req.applicableCategoryIds.toTypedArray())
            .param("prods", req.applicableProductIds.toTypedArray()).param("biz", req.requireBusiness)
            .update()
        if (n == 0) throw NotFoundException("Coupon not found")
        audit.record("admin", adminId, if (id == null) "CREATE" else "UPDATE", "coupon", couponId.toString(), after = req)
        return jdbc.sql("select * from coupon where id = :id").param("id", couponId).query { rs, _ -> adminView(rs) }.single()
    }

    @Transactional
    fun delete(adminId: UUID, id: UUID) {
        val used = jdbc.sql("select exists (select 1 from coupon_redemption where coupon_id = :id)").param("id", id).query(Boolean::class.javaObjectType).single()
        // A used code is kept for the order history; it is switched off instead.
        val n = if (used) jdbc.sql("update coupon set is_active = false, updated_at = now() where id = :id").param("id", id).update()
        else jdbc.sql("delete from coupon where id = :id").param("id", id).update()
        if (n == 0) throw NotFoundException("Coupon not found")
        audit.record("admin", adminId, if (used) "DEACTIVATE" else "DELETE", "coupon", id.toString())
    }

    private fun uuids(rs: ResultSet, column: String): Set<UUID> =
        (rs.getArray(column)?.array as? Array<*>)?.filterIsInstance<UUID>()?.toSet().orEmpty()

    private fun terms(rs: ResultSet) = CouponTerms(
        rs.getObject("id", UUID::class.java), rs.getString("code"), DiscountType.valueOf(rs.getString("discount_type")),
        rs.getLong("discount_value"), rs.getLong("min_order_paise"), rs.getObject("max_discount_paise") as Long?,
        rs.getObject("usage_limit") as Int?, rs.getInt("usage_count"), rs.getInt("per_customer_limit"),
        rs.getTimestamp("starts_at").toInstant(), rs.getTimestamp("ends_at").toInstant(), rs.getBoolean("is_active"),
        uuids(rs, "applicable_category_ids"), uuids(rs, "applicable_product_ids"), rs.getBoolean("require_business"),
    )

    private fun adminView(rs: ResultSet): Map<String, Any?> {
        val t = terms(rs)
        return mapOf(
            "id" to t.id, "code" to t.code, "description" to rs.getString("description"), "discountType" to t.discountType,
            "discountValue" to t.discountValue, "minOrderPaise" to t.minOrderPaise, "maxDiscountPaise" to t.maxDiscountPaise,
            "usageLimit" to t.usageLimit, "usageCount" to t.usageCount, "perCustomerLimit" to t.perCustomerLimit,
            "startsAt" to t.startsAt, "endsAt" to t.endsAt, "isActive" to t.isActive,
            "applicableCategoryIds" to t.applicableCategoryIds, "applicableProductIds" to t.applicableProductIds,
            "requireBusiness" to t.requireBusiness, "createdAt" to rs.getTimestamp("created_at").toInstant(),
        )
    }
}

// ================================================================ reviews

data class ReviewRequest(
    @field:Min(1) @field:Max(5) val rating: Int,
    @field:Size(max = 120) val title: String? = null,
    @field:Size(max = 4000) val comment: String? = null,
    @field:Size(max = 6) val images: List<String> = emptyList(),
)

data class ReviewView(
    val id: UUID, val productId: UUID, val rating: Int, val title: String?, val comment: String?, val images: List<String>,
    val isVerified: Boolean, val helpfulCount: Int, val authorName: String, val isPublished: Boolean, val createdAt: Instant,
)

data class ReviewSummary(val average: Double, val count: Int, val distribution: Map<Int, Int>)

/**
 * Whether a customer bought a product (a delivered order line). The orders
 * module provides the real check; until it exists every review is unverified.
 */
fun interface PurchaseVerifier {
    fun deliveredOrderFor(customerId: UUID, productId: UUID): UUID?
}

@Service
class ReviewService(
    private val jdbc: JdbcClient,
    private val verifiers: ObjectProvider<PurchaseVerifier>,
    private val audit: Audit,
) {
    fun forProduct(productId: UUID, page: PageParams): Pair<Page<ReviewView>, ReviewSummary> {
        val total = jdbc.sql("select count(*) from review where product_id = :p and is_published").param("p", productId).query(Long::class.javaObjectType).single()
        val items = jdbc.sql("$SELECT where r.product_id = :p and r.is_published order by r.is_verified desc, r.created_at desc limit :l offset :o")
            .param("p", productId).param("l", page.safeLimit).param("o", page.offset).query { rs, _ -> view(rs) }.list()
        val dist = jdbc.sql("select rating, count(*) as n from review where product_id = :p and is_published group by rating")
            .param("p", productId).query { rs, _ -> rs.getInt("rating") to rs.getInt("n") }.list().toMap()
        val count = dist.values.sum()
        val avg = if (count == 0) 0.0 else dist.entries.sumOf { it.key * it.value }.toDouble() / count
        return Page(items, total, page.safePage, page.safeLimit) to ReviewSummary(Math.round(avg * 10) / 10.0, count, (1..5).associateWith { dist[it] ?: 0 })
    }

    /** One review per customer per product; posting again edits it. */
    @Transactional
    fun upsert(customerId: UUID, productId: UUID, req: ReviewRequest): ReviewView {
        val exists = jdbc.sql("select exists (select 1 from product where id = :p)").param("p", productId).query(Boolean::class.javaObjectType).single()
        if (!exists) throw NotFoundException("Product not found")
        val order = verifiers.orderedStream().toList().firstNotNullOfOrNull { it.deliveredOrderFor(customerId, productId) }
        jdbc.sql(
            """
            insert into review (id, product_id, customer_id, order_id, rating, title, comment, images, is_verified)
            values (:id, :p, :c, :o, :r, :t, :m, :img, :v)
            on conflict (product_id, customer_id) do update set
                rating = excluded.rating, title = excluded.title, comment = excluded.comment, images = excluded.images,
                order_id = coalesce(excluded.order_id, review.order_id), is_verified = review.is_verified or excluded.is_verified,
                updated_at = now()
            """.trimIndent(),
        )
            .param("id", Ids.newId()).param("p", productId).param("c", customerId).param("o", order)
            .param("r", req.rating).param("t", req.title?.trim()).param("m", req.comment?.trim())
            .param("img", req.images.toTypedArray()).param("v", order != null)
            .update()
        recompute(productId)
        return jdbc.sql("$SELECT where r.product_id = :p and r.customer_id = :c").param("p", productId).param("c", customerId)
            .query { rs, _ -> view(rs) }.single()
    }

    @Transactional
    fun vote(reviewId: UUID, helpful: Boolean) {
        val column = if (helpful) "helpful_count" else "not_helpful_count"
        val n = jdbc.sql("update review set $column = $column + 1 where id = :id and is_published").param("id", reviewId).update()
        if (n == 0) throw NotFoundException("Review not found")
    }

    fun adminList(page: PageParams, published: Boolean?): Page<ReviewView> {
        val filter = published?.let { "where r.is_published = $it" } ?: ""
        val total = jdbc.sql("select count(*) from review r $filter").query(Long::class.javaObjectType).single()
        val items = jdbc.sql("$SELECT $filter order by r.created_at desc limit :l offset :o")
            .param("l", page.safeLimit).param("o", page.offset).query { rs, _ -> view(rs) }.list()
        return Page(items, total, page.safePage, page.safeLimit)
    }

    @Transactional
    fun setPublished(adminId: UUID, reviewId: UUID, published: Boolean) {
        val productId = jdbc.sql("update review set is_published = :pub, updated_at = now() where id = :id returning product_id")
            .param("pub", published).param("id", reviewId).query(UUID::class.java).optional().orElseThrow { NotFoundException("Review not found") }
        recompute(productId)
        audit.record("admin", adminId, if (published) "PUBLISH" else "UNPUBLISH", "review", reviewId.toString())
    }

    @Transactional
    fun delete(adminId: UUID, reviewId: UUID) {
        val productId = jdbc.sql("delete from review where id = :id returning product_id").param("id", reviewId)
            .query(UUID::class.java).optional().orElseThrow { NotFoundException("Review not found") }
        recompute(productId)
        audit.record("admin", adminId, "DELETE", "review", reviewId.toString())
    }

    /** Product rating = mean of its published reviews, to two places. */
    private fun recompute(productId: UUID) {
        jdbc.sql(
            """
            update product p set
                rating = coalesce((select round(avg(rating)::numeric, 2) from review where product_id = p.id and is_published), 0),
                rating_count = (select count(*) from review where product_id = p.id and is_published),
                review_count = (select count(*) from review where product_id = p.id and is_published and coalesce(comment, '') <> '')
            where p.id = :p
            """.trimIndent(),
        ).param("p", productId).update()
    }

    private fun view(rs: ResultSet) = ReviewView(
        rs.getObject("id", UUID::class.java), rs.getObject("product_id", UUID::class.java), rs.getInt("rating"),
        rs.getString("title"), rs.getString("comment"),
        (rs.getArray("images")?.array as? Array<*>)?.filterIsInstance<String>().orEmpty(),
        rs.getBoolean("is_verified"), rs.getInt("helpful_count"),
        // First name and initial only: a review never exposes a shopper's full name.
        listOf(rs.getString("first_name"), rs.getString("last_name")?.take(1)).filter { !it.isNullOrBlank() }.joinToString(" "),
        rs.getBoolean("is_published"), rs.getTimestamp("created_at").toInstant(),
    )

    companion object {
        private const val SELECT = "select r.*, c.first_name, c.last_name from review r join customer c on c.id = r.customer_id"
    }
}
