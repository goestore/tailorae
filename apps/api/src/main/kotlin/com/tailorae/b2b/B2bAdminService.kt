package com.tailorae.b2b

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonUnwrapped
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

data class Pagination(val page: Int, val limit: Int, val total: Long, val pages: Int) {
    companion object {
        fun of(page: Int, limit: Int, total: Long) = Pagination(page, limit, total, ((total + limit - 1) / limit).toInt())
    }
}

data class AdminRfqList(val rfqs: List<RfqView>, val counts: Map<String, Long>, val pagination: Pagination)

data class AdminBulkOrderList(val bulkOrders: List<BulkOrderView>, val counts: Map<String, Long>, val pagination: Pagination)

data class ProfileCounts(val rfqs: Long, val bulkOrders: Long)

/** Flat, as legacy: the profile fields plus `user` and `_count`. */
data class AdminProfileView(@get:JsonUnwrapped val profile: B2bProfileView, val user: B2bUserView, @get:JsonProperty("_count") val counts: ProfileCounts)

data class AdminProfileList(val profiles: List<AdminProfileView>, val counts: Map<String, Long>, val pagination: Pagination)

/**
 * Staff side of wholesale (legacy-api `routes/admin-b2b.ts`): price quote
 * requests, verify business profiles, move bulk orders along, keep the
 * trade-credit ledger.
 */
@Service
class B2bAdminService(private val jdbc: JdbcClient, private val reads: B2bReads, private val audit: Audit) {

    @Transactional
    fun rfqs(status: String?, page: Int, limit: Int): AdminRfqList {
        val st = status?.uppercase()?.takeIf { it.isNotBlank() }
        if (st != null && st !in B2bRules.RFQ_STATUSES) throw BadRequestException("status must be one of ${B2bRules.RFQ_STATUSES.joinToString(", ")}")
        reads.expireStaleQuotes()
        val (safePage, size) = page.coerceAtLeast(1) to limit.coerceIn(1, 100)
        val where = if (st != null) "where r.status = :s" else ""
        val params = if (st != null) mapOf("s" to st) else emptyMap()
        val total = jdbc.sql("select count(*) from rfq r $where").params(params).query(Long::class.javaObjectType).single()
        // Oldest pending first, so the longest wait is answered next; everything else newest first.
        val rows = reads.rfqs(where, params, if (st == "PENDING") "r.created_at asc" else "r.created_at desc", staff = true, size, (safePage - 1) * size)
        return AdminRfqList(rows, counts("rfq", B2bRules.RFQ_STATUSES), Pagination.of(safePage, size, total))
    }

    /** Body: `{ status: 'QUOTED', quotedPricePaise, expiryDate?, notes? }` or `{ status: 'REJECTED', notes }`. */
    @Transactional
    fun decideRfq(adminId: UUID, id: UUID, body: JsonNode?): RfqView {
        val b = body?.takeIf { it.isObject } ?: throw BadRequestException("status must be 'QUOTED' or 'REJECTED'")
        val status = b.get("status")?.takeIf { it.isString }?.asString()
        if (status != "QUOTED" && status != "REJECTED") throw BadRequestException("status must be 'QUOTED' or 'REJECTED'")
        val notesNode = b.get("notes")
        if (notesNode != null && !notesNode.isNull && !notesNode.isString) throw BadRequestException("notes must be text")
        val notes = notesNode?.takeIf { it.isString }?.asString()
        if (notes != null && notes.length > B2bRules.MAX_TEXT) throw BadRequestException("notes must be ${B2bRules.MAX_TEXT} characters or fewer")

        var price: Long? = null
        var expiry: Instant? = null
        if (status == "QUOTED") {
            val p = b.get("quotedPricePaise")
            if (p == null || !p.isIntegralNumber || p.asLong() <= 0) throw BadRequestException("A quote needs a unit price greater than zero")
            price = p.asLong()
            val e = b.get("expiryDate")?.takeUnless { it.isNull || (it.isString && it.asString().isBlank()) }
            expiry = if (e != null) {
                val parsed = (if (e.isString) B2bRules.parseDate(e.asString()) else null) ?: throw BadRequestException("expiryDate must be a valid date")
                if (!parsed.isAfter(Instant.now())) throw BadRequestException("The quote must expire in the future")
                parsed
            } else Instant.now().plus(Duration.ofDays(B2bRules.DEFAULT_QUOTE_DAYS))
        } else if (notes.isNullOrBlank()) {
            throw BadRequestException("Add a note telling the buyer why the request was declined")
        }

        val before = reads.rfq(id, staff = true) ?: throw NotFoundException("RFQ not found")
        // A buyer's answer is final; everything before it can be (re)quoted or declined.
        if (before.status == "ACCEPTED" || before.status == "REJECTED") throw ConflictException("This RFQ is already ${before.status.lowercase()}")

        val keepNotes = status == "QUOTED" && notesNode == null
        val changed = jdbc.sql(
            """
            update rfq set status = :s, quoted_price_paise = coalesce(:price, quoted_price_paise),
                expires_at = coalesce(:exp, expires_at), quoted_by = :by, quoted_at = now(),
                notes = case when :keep then notes else :notes end, updated_at = now()
            where id = :id and status = :was
            """.trimIndent(),
        )
            .param("s", status).param("price", price).param("exp", expiry?.let(Timestamp::from)).param("by", adminId)
            .param("keep", keepNotes).param("notes", notes?.trim()?.ifEmpty { null }).param("id", id).param("was", before.status)
            .update()
        // Conditional on the status read above, so a buyer accepting at the same moment is not overwritten.
        if (changed == 0) throw ConflictException("This RFQ changed while you were editing it. Reload and try again.")
        val after = reads.rfq(id, staff = true)!!
        audit.record(
            "admin", adminId, if (status == "QUOTED") "RFQ_QUOTE" else "RFQ_REJECT", "rfq", id.toString(),
            mapOf("status" to before.status, "quotedPricePaise" to before.quotedPricePaise, "expiryDate" to before.expiryDate),
            mapOf("status" to after.status, "quotedPricePaise" to after.quotedPricePaise, "expiryDate" to after.expiryDate, "notes" to after.notes),
        )
        return after
    }

    @Transactional(readOnly = true)
    fun profiles(verified: Boolean?, query: String?, page: Int, limit: Int): AdminProfileList {
        val (safePage, size) = page.coerceAtLeast(1) to limit.coerceIn(1, 100)
        val conditions = mutableListOf<String>()
        val params = mutableMapOf<String, Any?>()
        if (verified == true) conditions += "bp.verified_at is not null"
        if (verified == false) conditions += "bp.verified_at is null"
        val q = query?.trim()?.takeIf { it.isNotEmpty() }
        if (q != null) {
            conditions += "(bp.company_name ilike :q or bp.gstin like :gst or cu.email ilike :q)"
            params["q"] = "%$q%"
            params["gst"] = "%${q.uppercase()}%"
        }
        val where = if (conditions.isEmpty()) "" else "where " + conditions.joinToString(" and ")
        val from = "from customer_business_profile bp join customer cu on cu.id = bp.customer_id"
        val total = jdbc.sql("select count(*) $from $where").params(params).query(Long::class.javaObjectType).single()
        val rows = jdbc.sql(
            """
            select bp.*, ${B2bReads.PROFILE_SELECT},
                (select count(*) from rfq r where r.customer_id = bp.customer_id) as rfq_count,
                (select count(*) from bulk_order o where o.customer_id = bp.customer_id) as bulk_count
            $from $where
            order by (bp.verified_at is not null), bp.created_at desc limit :l offset :o
            """.trimIndent(),
        ).params(params).param("l", size).param("o", (safePage - 1) * size)
            .query { rs, _ -> AdminProfileView(reads.profileView(rs), reads.profileSummary(rs).user, ProfileCounts(rs.getLong("rfq_count"), rs.getLong("bulk_count"))) }
            .list()
        val counts = jdbc.sql("select count(*) filter (where verified_at is not null) as v, count(*) filter (where verified_at is null) as u from customer_business_profile")
            .query { rs, _ -> mapOf("verified" to rs.getLong("v"), "unverified" to rs.getLong("u")) }.single()
        return AdminProfileList(rows, counts, Pagination.of(safePage, size, total))
    }

    /**
     * Body: any of `{ isVerified, creditLimitPaise, minOrderQuantity, discountTier }`.
     * Verifying is what unlocks wholesale pricing on bulk orders.
     */
    @Transactional
    fun updateProfile(adminId: UUID, customerId: UUID, body: JsonNode?): AdminProfileView {
        val b = body?.takeIf { it.isObject } ?: throw BadRequestException("isVerified must be true or false")
        val before = reads.profile(customerId) ?: throw NotFoundException("Profile not found")
        val verified = b.get("isVerified")?.let { if (!it.isBoolean) throw BadRequestException("isVerified must be true or false") else it.asBoolean() }
        val limit = b.get("creditLimitPaise")?.let {
            if (!it.isIntegralNumber || it.asLong() < 0) throw BadRequestException("creditLimitPaise must be a whole number of paise, zero or more") else it.asLong()
        }
        if (limit != null && limit < before.creditUsedPaise) throw ConflictException("The credit limit cannot be below the outstanding balance")
        val moq = b.get("minOrderQuantity")?.let {
            if (!it.isIntegralNumber || it.asLong() !in 1..B2bRules.MAX_RFQ_QUANTITY.toLong()) throw BadRequestException("minOrderQuantity must be at least 1") else it.asInt()
        }
        val tier = b.get("discountTier")?.let {
            if (!it.isString || it.asString().isBlank() || it.asString().length > 40) throw BadRequestException("discountTier must be a short name") else it.asString().trim().uppercase()
        }
        if (verified == null && limit == null && moq == null && tier == null) throw BadRequestException("isVerified must be true or false")

        jdbc.sql(
            """
            update customer_business_profile set
                verified_at = case when cast(:v as boolean) is null then verified_at when cast(:v2 as boolean) then coalesce(verified_at, now()) else null end,
                credit_limit_paise = coalesce(:limit, credit_limit_paise),
                min_order_quantity = coalesce(:moq, min_order_quantity),
                discount_tier = coalesce(:tier, discount_tier),
                updated_at = now()
            where customer_id = :c
            """.trimIndent(),
        ).param("v", verified).param("v2", verified).param("limit", limit).param("moq", moq).param("tier", tier).param("c", customerId).update()
        val after = reads.profile(customerId)!!
        audit.record(
            "admin", adminId, if (verified == true) "B2B_VERIFY" else if (verified == false) "B2B_UNVERIFY" else "UPDATE",
            "customer_business_profile", customerId.toString(),
            mapOf("isVerified" to before.isVerified, "creditLimitPaise" to before.creditLimitPaise, "minOrderQuantity" to before.minOrderQuantity, "discountTier" to before.discountTier),
            mapOf("isVerified" to after.isVerified, "creditLimitPaise" to after.creditLimitPaise, "minOrderQuantity" to after.minOrderQuantity, "discountTier" to after.discountTier),
        )
        return adminProfile(customerId)
    }

    @Transactional(readOnly = true)
    fun bulkOrders(status: String?, page: Int, limit: Int): AdminBulkOrderList {
        val st = status?.uppercase()?.takeIf { it.isNotBlank() }
        if (st != null && st !in B2bRules.BULK_STATUSES) throw BadRequestException("status must be one of ${B2bRules.BULK_STATUSES.joinToString(", ")}")
        val (safePage, size) = page.coerceAtLeast(1) to limit.coerceIn(1, 100)
        val where = if (st != null) "where o.status = :s" else ""
        val params = if (st != null) mapOf("s" to st) else emptyMap()
        val total = jdbc.sql("select count(*) from bulk_order o $where").params(params).query(Long::class.javaObjectType).single()
        val rows = reads.bulkOrders(where, params, staff = true, size, (safePage - 1) * size)
        return AdminBulkOrderList(rows, counts("bulk_order", B2bRules.BULK_STATUSES), Pagination.of(safePage, size, total))
    }

    @Transactional
    fun setBulkOrderStatus(adminId: UUID, id: UUID, rawStatus: String?): BulkOrderView {
        val status = rawStatus?.uppercase() ?: ""
        if (status !in B2bRules.BULK_STATUSES) throw BadRequestException("status must be one of ${B2bRules.BULK_STATUSES.joinToString(", ")}")
        val order = reads.bulkOrder(id, staff = true) ?: throw NotFoundException("Bulk order not found")
        if (order.status == "DELIVERED" || order.status == "CANCELLED") throw ConflictException("This order is already ${order.status.lowercase()}")
        if (order.status == status) throw BadRequestException("Order is already ${status.lowercase()}")
        jdbc.sql("update bulk_order set status = :s, updated_at = now() where id = :id").param("s", status).param("id", id).update()
        audit.record("admin", adminId, "BULK_ORDER_STATUS", "bulk_order", id.toString(), mapOf("status" to order.status), mapOf("status" to status))
        return reads.bulkOrder(id, staff = true)!!
    }

    @Transactional(readOnly = true)
    fun credit(customerId: UUID): CreditView = reads.credit(reads.profile(customerId) ?: throw NotFoundException("Profile not found"))

    /** Body: `{ type, amountPaise, description?, reference?, orderId? }`. */
    @Transactional
    fun recordCredit(adminId: UUID, customerId: UUID, body: JsonNode?): CreditView {
        val b = body?.takeIf { it.isObject } ?: throw BadRequestException("type must be one of ${B2bRules.CREDIT_TYPES.joinToString(", ")}")
        val type = b.get("type")?.takeIf { it.isString }?.asString()?.uppercase() ?: ""
        val amount = b.get("amountPaise")?.takeIf { it.isIntegralNumber }?.asLong() ?: throw BadRequestException("amountPaise must be a whole number of paise")
        val description = b.get("description")?.takeIf { it.isString }?.asString()?.trim()?.take(500)?.ifEmpty { null }
        val reference = b.get("reference")?.takeIf { it.isString }?.asString()?.trim()?.take(120)?.ifEmpty { null }
        val orderId = b.get("orderId")?.takeIf { it.isString }?.asString()?.let {
            runCatching { UUID.fromString(it) }.getOrElse { throw BadRequestException("orderId must be an order id") }
        }
        // Serialise ledger writes per buyer: the balance is read, checked and written.
        val used = jdbc.sql("select credit_used_paise, credit_limit_paise from customer_business_profile where customer_id = :c for update")
            .param("c", customerId).query { rs, _ -> rs.getLong(1) to rs.getLong(2) }
            .optional().orElseThrow { NotFoundException("Profile not found") }
        val next = B2bRules.applyCredit(type, amount, used.first, used.second).getOrElse {
            if (it is IllegalStateException) throw ConflictException(it.message ?: "Not allowed") else throw BadRequestException(it.message ?: "Invalid entry")
        }
        jdbc.sql("update customer_business_profile set credit_used_paise = :u, updated_at = now() where customer_id = :c")
            .param("u", next).param("c", customerId).update()
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into credit_transaction (id, customer_id, order_id, type, amount_paise, balance_paise, description, reference, created_by)
            values (:id, :c, :o, :t, :a, :b, :d, :r, :by)
            """.trimIndent(),
        )
            .param("id", id).param("c", customerId).param("o", orderId).param("t", type).param("a", B2bRules.signedAmount(type, amount))
            .param("b", next).param("d", description).param("r", reference).param("by", adminId)
            .update()
        audit.record("admin", adminId, "CREDIT_$type", "customer_business_profile", customerId.toString(),
            mapOf("creditUsedPaise" to used.first), mapOf("creditUsedPaise" to next, "transactionId" to id))
        return credit(customerId)
    }

    private fun adminProfile(customerId: UUID): AdminProfileView =
        jdbc.sql(
            """
            select bp.*, ${B2bReads.PROFILE_SELECT},
                (select count(*) from rfq r where r.customer_id = bp.customer_id) as rfq_count,
                (select count(*) from bulk_order o where o.customer_id = bp.customer_id) as bulk_count
            from customer_business_profile bp join customer cu on cu.id = bp.customer_id where bp.customer_id = :c
            """.trimIndent(),
        ).param("c", customerId)
            .query { rs, _ -> AdminProfileView(reads.profileView(rs), reads.profileSummary(rs).user, ProfileCounts(rs.getLong("rfq_count"), rs.getLong("bulk_count"))) }
            .single()

    private fun counts(table: String, statuses: List<String>): Map<String, Long> {
        val grouped = jdbc.sql("select status, count(*) as n from $table group by status")
            .query { rs, _ -> rs.getString("status") to rs.getLong("n") }.list().toMap()
        return statuses.associateWith { grouped[it] ?: 0L }
    }
}
