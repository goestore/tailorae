package com.tailorae.b2b

import com.tailorae.common.ApiException
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

// ================================================================ views

data class B2bProfileView(
    /** The customer's id: one profile per customer account. */
    val id: UUID,
    val companyName: String,
    val companyRegistration: String?,
    val gstNumber: String?,
    val panNumber: String?,
    val businessType: String,
    val businessCategory: String?,
    val monthlyBudgetPaise: Long?,
    val employeeCount: Int?,
    val businessDescription: String?,
    val website: String?,
    val isVerified: Boolean,
    val verifiedAt: Instant?,
    val minOrderQuantity: Int,
    val discountTier: String,
    val creditLimitPaise: Long,
    val creditUsedPaise: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class ProductSummary(val id: UUID, val name: String, val slug: String, val thumbnail: String?, val pricePaise: Long)

data class B2bUserView(val id: UUID, val email: String, val firstName: String, val lastName: String, val phone: String?, val type: String, val status: String)

data class ProfileSummary(
    val id: UUID,
    val companyName: String,
    val businessType: String,
    val gstNumber: String?,
    val panNumber: String?,
    val isVerified: Boolean,
    val user: B2bUserView,
)

data class RfqView(
    val id: UUID,
    val rfqNumber: String,
    val productId: UUID?,
    val product: ProductSummary?,
    val quantity: Int,
    val desiredPricePaise: Long?,
    val deliveryDate: Instant?,
    val specialRequirements: String?,
    val status: String,
    val quotedPricePaise: Long?,
    val quotedDate: Instant?,
    val notes: String?,
    val documents: List<String>,
    val expiryDate: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
    /** Staff views only. */
    val quotedBy: UUID? = null,
    val b2bProfile: ProfileSummary? = null,
)

data class BulkOrderView(
    val id: UUID,
    val orderNumber: String,
    val productId: UUID?,
    val product: ProductSummary?,
    val rfqId: UUID?,
    val quantity: Int,
    val unitPricePaise: Long,
    val totalPricePaise: Long,
    val status: String,
    val expectedDelivery: Instant?,
    val specialRequirements: String?,
    val paymentTerms: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val b2bProfile: ProfileSummary? = null,
)

data class CreditTransactionView(
    val id: UUID,
    val type: String,
    /** Signed change to credit used. */
    val amountPaise: Long,
    /** Credit used after this entry. */
    val balancePaise: Long,
    val orderId: UUID?,
    val description: String?,
    val reference: String?,
    val createdAt: Instant,
)

data class CreditView(val creditLimitPaise: Long, val creditUsedPaise: Long, val availablePaise: Long, val transactions: List<CreditTransactionView>)

/**
 * The buyer's side of wholesale: business profile, quote requests, bulk orders,
 * trade credit (legacy-api `routes/b2b.ts`).
 *
 * Any signed-in customer may keep a profile and ask for quotes — staff price
 * every request by hand, so there is nothing to protect by gating it. Saving a
 * profile makes the account a business account (`customer.type = BUSINESS`,
 * docs/ACCOUNTS.md); wholesale pricing on bulk orders still waits for staff to
 * verify the profile.
 */
@Service
class B2bService(
    private val jdbc: JdbcClient,
    private val reads: B2bReads,
    private val profiles: com.tailorae.identity.CustomerProfileService,
) {

    @Transactional(readOnly = true)
    fun profile(customerId: UUID): B2bProfileView? = reads.profile(customerId)

    @Transactional(readOnly = true)
    fun customerType(customerId: UUID): String =
        jdbc.sql("select type from customer where id = :id").param("id", customerId).query(String::class.java).optional().orElse("INDIVIDUAL")

    data class Saved(val profile: B2bProfileView, val created: Boolean, val verificationVoided: Boolean)

    @Transactional
    fun saveProfile(customerId: UUID, body: JsonNode?): Saved {
        val picked = B2bRules.pickProfile(body)
        val errors = picked.errors.toMutableList()
        val existing = reads.profile(customerId)
        val values = picked.values
        if (existing == null && (values["companyName"] as String?).isNullOrBlank()) errors += "Company name is required"
        val pan = if ("panNumber" in values) values["panNumber"] as String? else existing?.panNumber
        val gstin = if ("gstNumber" in values) values["gstNumber"] as String? else existing?.gstNumber
        if (!B2bRules.gstinMatchesPan(pan, gstin)) errors += "GSTIN does not belong to this PAN"
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))
        if (values.isEmpty()) throw BadRequestException("No profile details were provided")

        try {
            if (existing == null) {
                jdbc.sql("insert into customer_business_profile (customer_id, company_name, business_type) values (:c, :n, :t)")
                    .param("c", customerId).param("n", values["companyName"])
                    .param("t", values["businessType"] ?: B2bRules.UNSPECIFIED_BUSINESS_TYPE).update()
            }
            for ((field, value) in values) {
                jdbc.sql("update customer_business_profile set ${B2bRules.PROFILE_COLUMNS.getValue(field)} = :v, updated_at = now() where customer_id = :c")
                    .param("v", value).param("c", customerId).update()
            }
        } catch (e: DuplicateKeyException) {
            throw ConflictException("That GSTIN or PAN is already registered to another account")
        }
        val voided = existing != null && B2bRules.voidsVerification(
            existing.isVerified,
            mapOf("companyName" to existing.companyName, "gstNumber" to existing.gstNumber, "panNumber" to existing.panNumber),
            values,
        )
        if (voided) jdbc.sql("update customer_business_profile set verified_at = null where customer_id = :c").param("c", customerId).update()
        markBusiness(customerId)
        return Saved(reads.profile(customerId)!!, existing == null, voided)
    }

    @Transactional
    fun createRfq(customerId: UUID, body: JsonNode?): Pair<RfqView, Boolean> {
        val b = body?.takeIf { it.isObject } ?: throw BadRequestException("Choose a product")
        val errors = mutableListOf<String>()
        val productId = b.get("productId")?.takeIf { it.isString }?.asString()?.let { runCatching { UUID.fromString(it.trim()) }.getOrNull() }
        if (productId == null) errors += "Choose a product"
        val q = b.get("quantity")
        val quantity = if (q != null && q.isIntegralNumber && q.asLong() >= 1) q.asLong() else null
        if (quantity == null) errors += "Quantity must be a whole number of at least 1"
        else if (quantity > B2bRules.MAX_RFQ_QUANTITY) errors += "Quantity cannot exceed 10,00,000"

        var desired: Long? = null
        b.get("targetPricePaise")?.takeUnless { it.isNull || (it.isString && it.asString().isBlank()) }?.let {
            if (it.isIntegralNumber && it.asLong() > 0) desired = it.asLong() else errors += "Target price must be a whole number of paise above zero"
        }
        var deadline: Instant? = null
        b.get("deadline")?.takeUnless { it.isNull || (it.isString && it.asString().isBlank()) }?.let {
            val parsed = if (it.isString) B2bRules.parseDate(it.asString()) else null
            when {
                parsed == null -> errors += "Deadline must be a valid date"
                parsed.isBefore(Instant.now().minus(Duration.ofDays(1))) -> errors += "Deadline cannot be in the past"
                else -> deadline = parsed
            }
        }
        val description = b.get("description")?.takeUnless { it.isNull }
        if (description != null && !description.isString) errors += "Requirements must be text"
        else if (description != null && description.asString().length > B2bRules.MAX_TEXT) errors += "Requirements must be ${B2bRules.MAX_TEXT} characters or fewer"
        val companyName = b.get("companyName")?.takeUnless { it.isNull }
        if (companyName != null && !companyName.isString) errors += "Company name must be text"

        var profile = reads.profile(customerId)
        if (profile == null && companyName?.takeIf { it.isString }?.asString().isNullOrBlank()) errors += "Company name is required for your first quote request"
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))

        val product = reads.listableProduct(productId!!) ?: throw NotFoundException("That product is not available for quotes")

        var created = false
        if (profile == null) {
            created = jdbc.sql(
                "insert into customer_business_profile (customer_id, company_name, business_type) values (:c, :n, :t) on conflict do nothing",
            ).param("c", customerId).param("n", companyName!!.asString().trim().take(120)).param("t", B2bRules.UNSPECIFIED_BUSINESS_TYPE).update() == 1
            markBusiness(customerId)
            profile = reads.profile(customerId)!!
        }

        // RFQ has no product-name column: a differing name the buyer typed goes into the requirements.
        val parts = listOfNotNull(
            b.get("productName")?.takeIf { it.isString }?.asString()?.trim()?.takeIf { it.isNotEmpty() && it != product.name }?.let { "Product: $it" },
            description?.asString()?.trim()?.takeIf { it.isNotEmpty() },
        )
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into rfq (id, rfq_number, customer_id, product_id, quantity, desired_price_paise, delivery_date, special_requirements)
            values (:id, :n, :c, :p, :q, :d, :dd, :req)
            """.trimIndent(),
        )
            .param("id", id).param("n", B2bRules.number("RFQ")).param("c", profile.id).param("p", product.id)
            .param("q", quantity!!.toInt()).param("d", desired).param("dd", deadline?.let(Timestamp::from))
            .param("req", parts.joinToString(" — ").ifEmpty { null })
            .update()
        return reads.rfq(id, staff = false)!! to created
    }

    @Transactional
    fun myRfqs(customerId: UUID): List<RfqView> {
        if (reads.profile(customerId) == null) return emptyList()
        reads.expireStaleQuotes(customerId)
        return reads.rfqs("where r.customer_id = :c", mapOf("c" to customerId), "r.created_at desc", staff = false)
    }

    /** Accept or reject a quote; accepting turns it into a bulk order at the quoted unit price. */
    @Transactional
    fun respond(customerId: UUID, rfqId: UUID, decision: String): Pair<RfqView, BulkOrderView?> {
        if (decision != "accept" && decision != "reject") throw BadRequestException("decision must be 'accept' or 'reject'")
        // Someone else's RFQ reads as not found, never forbidden.
        val rfq = reads.rfq(rfqId, staff = false)?.takeIf { ownerOf(rfqId) == customerId } ?: throw NotFoundException("Quote request not found")
        if (rfq.status == "QUOTED" && rfq.expiryDate != null && rfq.expiryDate.isBefore(Instant.now())) {
            reads.expireStaleQuotes(customerId)
            throw ConflictException("This quote has expired. Please request a new one.")
        }
        if (rfq.status != "QUOTED" || rfq.quotedPricePaise == null) {
            throw ConflictException(if (rfq.status == "PENDING") "This request has not been quoted yet" else "This quote is already ${rfq.status.lowercase()}")
        }
        // Conditional on status so two clicks cannot both succeed.
        val changed = jdbc.sql("update rfq set status = :s, updated_at = now() where id = :id and status = 'QUOTED'")
            .param("s", if (decision == "accept") "ACCEPTED" else "REJECTED").param("id", rfqId).update()
        if (changed == 0) throw ConflictException("This quote was already answered")

        val order = if (decision == "accept") {
            val id = Ids.newId()
            jdbc.sql(
                """
                insert into bulk_order (id, order_number, customer_id, product_id, rfq_id, quantity, unit_price_paise, total_price_paise,
                    expected_delivery, special_requirements)
                values (:id, :n, :c, :p, :rfq, :q, :unit, :total, :exp, :req)
                """.trimIndent(),
            )
                .param("id", id).param("n", B2bRules.number("BO")).param("c", customerId).param("p", rfq.productId)
                .param("rfq", rfqId).param("q", rfq.quantity).param("unit", rfq.quotedPricePaise)
                .param("total", Math.multiplyExact(rfq.quotedPricePaise, rfq.quantity.toLong()))
                .param("exp", rfq.deliveryDate?.let(Timestamp::from))
                .param("req", "From quote ${rfq.rfqNumber}" + (rfq.specialRequirements?.let { " — $it" } ?: ""))
                .update()
            reads.bulkOrder(id, staff = false)
        } else null
        return reads.rfq(rfqId, staff = false)!! to order
    }

    /** At wholesale tier pricing: verified business buyers only. */
    @Transactional
    fun createBulkOrder(customerId: UUID, body: JsonNode?): BulkOrderView {
        val b = body?.takeIf { it.isObject } ?: throw BadRequestException("productId is required")
        val productId = b.get("productId")?.takeIf { it.isString }?.asString()?.let { runCatching { UUID.fromString(it.trim()) }.getOrNull() }
            ?: throw BadRequestException("productId is required")
        val q = b.get("quantity")
        if (q == null || !q.isIntegralNumber || q.asLong() < 1 || q.asLong() > B2bRules.MAX_RFQ_QUANTITY) {
            throw BadRequestException("quantity must be a whole number of at least 1")
        }
        val quantity = q.asInt()
        val expected = b.get("expectedDelivery")?.takeUnless { it.isNull || (it.isString && it.asString().isBlank()) }?.let {
            (if (it.isString) B2bRules.parseDate(it.asString()) else null) ?: throw BadRequestException("expectedDelivery must be a valid date")
        }
        val special = optionalText(b, "specialRequirements")
        val terms = optionalText(b, "paymentTerms")

        val profile = reads.profile(customerId) ?: throw BadRequestException("Create your B2B profile before placing a bulk order")
        if (!profile.isVerified) throw ApiException(HttpStatus.FORBIDDEN, "Your business profile is awaiting verification")
        val product = jdbc.sql("select id, price_paise, allow_bulk_orders from product where id = :id and status = 'ACTIVE'")
            .param("id", productId)
            .query { rs, _ -> Triple(rs.getObject("id", UUID::class.java), rs.getLong("price_paise"), rs.getBoolean("allow_bulk_orders")) }
            .optional().orElseThrow { NotFoundException("Product not found") }
        if (!product.third) throw BadRequestException("This product does not allow bulk orders")
        val tiers = jdbc.sql("select min_qty, max_qty, price_paise from bulk_pricing where product_id = :p").param("p", productId)
            .query { rs, _ -> B2bRules.Tier(rs.getInt("min_qty"), rs.getObject("max_qty") as Int?, rs.getLong("price_paise")) }.list()
        val unit = B2bRules.unitPrice(quantity, product.second, tiers)

        val id = Ids.newId()
        jdbc.sql(
            """
            insert into bulk_order (id, order_number, customer_id, product_id, quantity, unit_price_paise, total_price_paise,
                expected_delivery, special_requirements, payment_terms)
            values (:id, :n, :c, :p, :q, :unit, :total, :exp, :req, :terms)
            """.trimIndent(),
        )
            .param("id", id).param("n", B2bRules.number("BO")).param("c", customerId).param("p", productId)
            .param("q", quantity).param("unit", unit).param("total", Math.multiplyExact(unit, quantity.toLong()))
            .param("exp", expected?.let(Timestamp::from)).param("req", special).param("terms", terms)
            .update()
        return reads.bulkOrder(id, staff = false)!!
    }

    @Transactional(readOnly = true)
    fun myBulkOrders(customerId: UUID): List<BulkOrderView> =
        reads.bulkOrders("where o.customer_id = :c", mapOf("c" to customerId), staff = false)

    @Transactional(readOnly = true)
    fun myCredit(customerId: UUID): CreditView? = reads.profile(customerId)?.let { reads.credit(it) }

    /** A business profile makes the account a business account; identity owns that column. */
    private fun markBusiness(customerId: UUID) = profiles.markBusiness(customerId)

    private fun ownerOf(rfqId: UUID): UUID? =
        jdbc.sql("select customer_id from rfq where id = :id").param("id", rfqId).query(UUID::class.java).optional().orElse(null)

    private fun optionalText(b: JsonNode, field: String): String? {
        val v = b.get(field)?.takeUnless { it.isNull } ?: return null
        if (!v.isString) throw BadRequestException("$field must be a string")
        return v.asString().trim().take(B2bRules.MAX_TEXT).ifEmpty { null }
    }
}

/** Shared reads for the buyer and staff services. */
@Service
class B2bReads(private val jdbc: JdbcClient) {

    fun profile(customerId: UUID): B2bProfileView? =
        jdbc.sql("select * from customer_business_profile where customer_id = :c").param("c", customerId)
            .query { rs, _ -> profileView(rs) }.optional().orElse(null)

    /** A product a buyer may ask a quote for: live and approved. */
    fun listableProduct(id: UUID): ProductSummary? =
        jdbc.sql("select id, name, slug, thumbnail, price_paise from product where id = :id and status = 'ACTIVE' and moderation_status = 'APPROVED'")
            .param("id", id).query { rs, _ -> productSummary(rs) }.optional().orElse(null)

    /** A quote past its expiry can no longer be accepted; record that it lapsed. */
    fun expireStaleQuotes(customerId: UUID? = null) {
        jdbc.sql(
            "update rfq set status = 'EXPIRED', updated_at = now() where status = 'QUOTED' and expires_at < now()" +
                if (customerId != null) " and customer_id = :c" else "",
        ).apply { if (customerId != null) param("c", customerId) }.update()
    }

    fun rfq(id: UUID, staff: Boolean): RfqView? = rfqs("where r.id = :id", mapOf("id" to id), "r.created_at", staff).firstOrNull()

    fun rfqs(where: String, params: Map<String, Any?>, order: String, staff: Boolean, limit: Int = 500, offset: Int = 0): List<RfqView> =
        jdbc.sql(
            """
            select r.*, p.name as p_name, p.slug as p_slug, p.thumbnail as p_thumbnail, p.price_paise as p_price,
                ${PROFILE_SELECT}
            from rfq r
            left join product p on p.id = r.product_id
            join customer_business_profile bp on bp.customer_id = r.customer_id
            join customer cu on cu.id = bp.customer_id
            $where order by $order limit :limit offset :offset
            """.trimIndent(),
        ).params(params).param("limit", limit).param("offset", offset)
            .query { rs, _ ->
                RfqView(
                    id = rs.getObject("id", UUID::class.java),
                    rfqNumber = rs.getString("rfq_number"),
                    productId = rs.getObject("product_id", UUID::class.java),
                    product = joinedProduct(rs),
                    quantity = rs.getInt("quantity"),
                    desiredPricePaise = rs.getObject("desired_price_paise") as Long?,
                    deliveryDate = rs.getTimestamp("delivery_date")?.toInstant(),
                    specialRequirements = rs.getString("special_requirements"),
                    status = rs.getString("status"),
                    quotedPricePaise = rs.getObject("quoted_price_paise") as Long?,
                    quotedDate = rs.getTimestamp("quoted_at")?.toInstant(),
                    notes = rs.getString("notes"),
                    documents = (rs.getArray("documents")?.array as? Array<*>)?.map { it.toString() } ?: emptyList(),
                    expiryDate = rs.getTimestamp("expires_at")?.toInstant(),
                    createdAt = rs.getTimestamp("created_at").toInstant(),
                    updatedAt = rs.getTimestamp("updated_at").toInstant(),
                    quotedBy = if (staff) rs.getObject("quoted_by", UUID::class.java) else null,
                    b2bProfile = if (staff) profileSummary(rs) else null,
                )
            }.list()

    fun bulkOrder(id: UUID, staff: Boolean): BulkOrderView? = bulkOrders("where o.id = :id", mapOf("id" to id), staff).firstOrNull()

    fun bulkOrders(where: String, params: Map<String, Any?>, staff: Boolean, limit: Int = 500, offset: Int = 0): List<BulkOrderView> =
        jdbc.sql(
            """
            select o.*, p.name as p_name, p.slug as p_slug, p.thumbnail as p_thumbnail, p.price_paise as p_price,
                ${PROFILE_SELECT}
            from bulk_order o
            left join product p on p.id = o.product_id
            join customer_business_profile bp on bp.customer_id = o.customer_id
            join customer cu on cu.id = bp.customer_id
            $where order by o.created_at desc limit :limit offset :offset
            """.trimIndent(),
        ).params(params).param("limit", limit).param("offset", offset)
            .query { rs, _ ->
                BulkOrderView(
                    id = rs.getObject("id", UUID::class.java),
                    orderNumber = rs.getString("order_number"),
                    productId = rs.getObject("product_id", UUID::class.java),
                    product = joinedProduct(rs),
                    rfqId = rs.getObject("rfq_id", UUID::class.java),
                    quantity = rs.getInt("quantity"),
                    unitPricePaise = rs.getLong("unit_price_paise"),
                    totalPricePaise = rs.getLong("total_price_paise"),
                    status = rs.getString("status"),
                    expectedDelivery = rs.getTimestamp("expected_delivery")?.toInstant(),
                    specialRequirements = rs.getString("special_requirements"),
                    paymentTerms = rs.getString("payment_terms"),
                    createdAt = rs.getTimestamp("created_at").toInstant(),
                    updatedAt = rs.getTimestamp("updated_at").toInstant(),
                    b2bProfile = if (staff) profileSummary(rs) else null,
                )
            }.list()

    fun credit(profile: B2bProfileView): CreditView {
        val rows = jdbc.sql("select * from credit_transaction where customer_id = :c order by created_at desc limit 200")
            .param("c", profile.id)
            .query { rs, _ ->
                CreditTransactionView(
                    rs.getObject("id", UUID::class.java), rs.getString("type"), rs.getLong("amount_paise"), rs.getLong("balance_paise"),
                    rs.getObject("order_id", UUID::class.java), rs.getString("description"), rs.getString("reference"),
                    rs.getTimestamp("created_at").toInstant(),
                )
            }.list()
        return CreditView(profile.creditLimitPaise, profile.creditUsedPaise, maxOf(0, profile.creditLimitPaise - profile.creditUsedPaise), rows)
    }

    fun profileView(rs: ResultSet) = B2bProfileView(
        id = rs.getObject("customer_id", UUID::class.java),
        companyName = rs.getString("company_name"),
        companyRegistration = rs.getString("company_registration"),
        gstNumber = rs.getString("gstin"),
        panNumber = rs.getString("pan"),
        businessType = rs.getString("business_type"),
        businessCategory = rs.getString("business_category"),
        monthlyBudgetPaise = rs.getObject("monthly_budget_paise") as Long?,
        employeeCount = rs.getObject("employee_count") as Int?,
        businessDescription = rs.getString("description"),
        website = rs.getString("website"),
        isVerified = rs.getTimestamp("verified_at") != null,
        verifiedAt = rs.getTimestamp("verified_at")?.toInstant(),
        minOrderQuantity = rs.getInt("min_order_quantity"),
        discountTier = rs.getString("discount_tier"),
        creditLimitPaise = rs.getLong("credit_limit_paise"),
        creditUsedPaise = rs.getLong("credit_used_paise"),
        createdAt = rs.getTimestamp("created_at").toInstant(),
        updatedAt = rs.getTimestamp("updated_at").toInstant(),
    )

    /** Reads the `bp_*` / `cu_*` columns of [PROFILE_SELECT]. */
    fun profileSummary(rs: ResultSet) = ProfileSummary(
        id = rs.getObject("bp_id", UUID::class.java),
        companyName = rs.getString("bp_company_name"),
        businessType = rs.getString("bp_business_type"),
        gstNumber = rs.getString("bp_gstin"),
        panNumber = rs.getString("bp_pan"),
        isVerified = rs.getTimestamp("bp_verified_at") != null,
        user = B2bUserView(
            rs.getObject("bp_id", UUID::class.java), rs.getString("cu_email"), rs.getString("cu_first_name"),
            rs.getString("cu_last_name"), rs.getString("cu_phone"), rs.getString("cu_type"), rs.getString("cu_status"),
        ),
    )

    private fun joinedProduct(rs: ResultSet): ProductSummary? =
        rs.getString("p_name")?.let {
            ProductSummary(rs.getObject("product_id", UUID::class.java), it, rs.getString("p_slug"), rs.getString("p_thumbnail"), rs.getLong("p_price"))
        }

    private fun productSummary(rs: ResultSet) = ProductSummary(
        rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getString("slug"), rs.getString("thumbnail"), rs.getLong("price_paise"),
    )

    companion object {
        const val PROFILE_SELECT = """
            bp.customer_id as bp_id, bp.company_name as bp_company_name, bp.business_type as bp_business_type,
            bp.gstin as bp_gstin, bp.pan as bp_pan, bp.verified_at as bp_verified_at,
            cu.email as cu_email, cu.first_name as cu_first_name, cu.last_name as cu_last_name, cu.phone as cu_phone,
            cu.type as cu_type, cu.status as cu_status
        """
    }
}
