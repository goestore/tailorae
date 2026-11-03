package com.tailorae.finance

import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.SellerScope
import com.tailorae.common.SystemSettings
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

data class HeldOrder(val sellerOrderId: UUID, val orderNumber: String, val payoutPaise: Long, val reason: String)

data class EarningsSummary(
    /** What the ledger says is owed right now (credited sales − payouts − reversals ± adjustments). */
    val balancePaise: Long,
    /** Seller-order value still inside the return window or not yet delivered. */
    val heldPaise: Long,
    val held: List<HeldOrder>,
    val lifetimeSalesPaise: Long,
    val lifetimePayoutsPaise: Long,
    val openWithdrawal: WithdrawalView?,
)

data class WithdrawalView(
    val id: UUID, val sellerId: UUID, val shopName: String?, val amountPaise: Long, val status: String,
    val transactionRef: String?, val rejectionReason: String?, val createdAt: Instant, val decidedAt: Instant?, val completedAt: Instant?,
)

data class SellerBalanceRow(val sellerId: UUID, val shopName: String, val balancePaise: Long, val heldPaise: Long, val lastPayoutAt: Instant?)

/**
 * The seller ledger and everything that moves money in it. Every write to a
 * seller's ledger takes that seller's advisory lock first, so two payouts (or
 * a payout and a sweep) can never both read the same balance.
 */
@Service
class FinanceService(
    private val jdbc: JdbcClient,
    private val settings: SystemSettings,
    private val scope: SellerScope,
    private val audit: Audit,
    private val json: JsonMapper,
) {
    private fun holdDays() = settings.int(SystemSettings.SETTLEMENT_HOLD_DAYS, 7)

    private fun lock(sellerId: UUID) {
        jdbc.sql("select pg_advisory_xact_lock(hashtext(:k))").param("k", "ledger:$sellerId").query().singleValue()
    }

    // ================================================================ commission

    /** A resolver for one checkout: categories are read once each, from the database. */
    fun commissionResolver(): Commission.Resolver = Commission.Resolver { id ->
        jdbc.sql("select parent_id, commission_rate_bp from category where id = :id").param("id", id)
            .query { rs, _ -> Commission.CategoryRow(rs.getObject("parent_id", UUID::class.java), rs.getObject("commission_rate_bp") as Int?) }
            .optional().orElse(null)
    }

    fun defaultCommissionBp() = settings.int(SystemSettings.DEFAULT_COMMISSION_BP, 1000)

    // ================================================================ posting

    /** Credits a delivered, cleared seller order once. Platform stock is never credited. */
    @Transactional(propagation = Propagation.MANDATORY)
    fun postSale(sellerOrderId: UUID): Boolean {
        val so = sellerOrder(sellerOrderId) ?: return false
        if (so.isPlatform) return false
        lock(so.sellerId)
        return insertOnce(so.sellerId, so.id, LedgerType.SALE, so.payoutPaise, "Order ${so.orderNumber}", null)
    }

    /**
     * Takes back a return. Only reverses what reached the ledger (or was settled
     * before it existed), so a return inside the window simply never gets paid.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun postReturnReversal(sellerOrderId: UUID, actorId: UUID?): Boolean {
        val so = sellerOrder(sellerOrderId) ?: return false
        if (so.isPlatform) return false
        lock(so.sellerId)
        val credited = jdbc.sql("select exists (select 1 from seller_ledger_entry where seller_order_id = :id and type = 'SALE')")
            .param("id", so.id).query(Boolean::class.javaObjectType).single()
        if (!credited && so.settledAt == null) return false
        return insertOnce(so.sellerId, so.id, LedgerType.RETURN_REVERSAL, so.payoutPaise, "Return on ${so.orderNumber}", actorId)
    }

    /** Credits every cleared seller order not yet credited. The nightly sweep and every payout run it. */
    @Transactional
    fun syncSales(sellerId: UUID?, now: Instant = Instant.now()): Int {
        val cutoff = Timestamp.from(Settlement.cutoff(now, holdDays()))
        val ids = jdbc.sql(
            """
            select so.id from seller_order so join seller s on s.id = so.seller_id
            where so.status = 'DELIVERED' and so.settled_at is null and so.delivered_at is not null and so.delivered_at <= :cutoff
              and not s.is_platform
              and (cast(:seller as uuid) is null or so.seller_id = :seller)
              and not exists (select 1 from return_request r where r.order_id = so.order_id and r.status <> 'REJECTED')
              and not exists (select 1 from seller_ledger_entry e where e.seller_order_id = so.id and e.type = 'SALE')
            """.trimIndent(),
        ).param("cutoff", cutoff).param("seller", sellerId).query(UUID::class.java).list()
        return ids.filterNotNull().count { postSale(it) }
    }

    // ================================================================ reading

    fun balance(sellerId: UUID): Long =
        jdbc.sql("select coalesce(sum(amount_paise), 0) from seller_ledger_entry where seller_id = :s")
            .param("s", sellerId).query(Long::class.javaObjectType).single()

    /** The seller's own earnings page. */
    @Transactional
    fun sellerSummary(sellerId: UUID, now: Instant = Instant.now()): EarningsSummary {
        syncSales(sellerId, now)
        scope.enter(sellerId)
        return summary(sellerId, now, scoped = true)
    }

    @Transactional(readOnly = true)
    fun adminSummary(sellerId: UUID, now: Instant = Instant.now()): EarningsSummary = summary(sellerId, now, scoped = false)

    private fun summary(sellerId: UUID, now: Instant, scoped: Boolean): EarningsSummary {
        // In the seller scope the return status comes through the narrow view; staff read the table.
        val returns = if (scoped) "seller_order_return" else "(select so2.id as seller_order_id, r.status as return_status from seller_order so2 join return_request r on r.order_id = so2.order_id)"
        val held = jdbc.sql(
            """
            select so.id, so.order_number, so.payout_paise, so.status, so.delivered_at, so.settled_at, ret.return_status
            from seller_order so
            left join $returns ret on ret.seller_order_id = so.id
            where so.seller_id = :s and so.settled_at is null and so.status not in ('CANCELLED', 'RETURNED')
              and not exists (select 1 from seller_ledger_entry e where e.seller_order_id = so.id and e.type = 'SALE')
            order by so.created_at desc
            """.trimIndent(),
        ).param("s", sellerId).query { rs, _ ->
            val reason = Settlement.holdReason(rs.getString("status"), rs.getTimestamp("delivered_at")?.toInstant(),
                rs.getTimestamp("settled_at")?.toInstant(), rs.getString("return_status"), now, holdDays())
            reason?.let { HeldOrder(rs.getObject("id", UUID::class.java), rs.getString("order_number"), rs.getLong("payout_paise"), it) }
        }.list().filterNotNull()
        val totals = jdbc.sql(
            """
            select coalesce(sum(amount_paise) filter (where type = 'SALE'), 0) as sales,
                   coalesce(-sum(amount_paise) filter (where type = 'PAYOUT'), 0) as payouts
            from seller_ledger_entry where seller_id = :s
            """.trimIndent(),
        ).param("s", sellerId).query { rs, _ -> rs.getLong("sales") to rs.getLong("payouts") }.single()
        return EarningsSummary(balance(sellerId), held.sumOf { it.payoutPaise }, held, totals.first, totals.second, openWithdrawal(sellerId))
    }

    fun statement(sellerId: UUID, from: Instant?, to: Instant?): Ledger.Statement {
        val opening = if (from == null) 0L else jdbc.sql("select coalesce(sum(amount_paise), 0) from seller_ledger_entry where seller_id = :s and created_at < :from")
            .param("s", sellerId).param("from", Timestamp.from(from)).query(Long::class.javaObjectType).single()
        val entries = jdbc.sql(
            """
            select e.id, e.created_at, e.type, so.order_number, e.reference, e.note, e.amount_paise
            from seller_ledger_entry e left join seller_order so on so.id = e.seller_order_id
            where e.seller_id = :s and (cast(:from as timestamptz) is null or e.created_at >= :from)
              and (cast(:to as timestamptz) is null or e.created_at <= :to)
            order by e.created_at, e.id limit 5000
            """.trimIndent(),
        ).param("s", sellerId).param("from", from?.let(Timestamp::from)).param("to", to?.let(Timestamp::from)).query { rs, _ ->
            Ledger.Entry(rs.getObject("id", UUID::class.java), rs.getTimestamp("created_at").toInstant(), LedgerType.valueOf(rs.getString("type")),
                rs.getString("order_number"), rs.getString("reference"), rs.getString("note"), rs.getLong("amount_paise"))
        }.list()
        return Ledger.withRunningBalance(opening, entries)
    }

    @Transactional(readOnly = true)
    fun sellerStatement(sellerId: UUID, from: Instant?, to: Instant?): Ledger.Statement {
        scope.enter(sellerId)
        return statement(sellerId, from, to)
    }

    /** Every non-platform seller with money owed or held, for the payouts screen. */
    @Transactional
    fun balances(page: PageParams, now: Instant = Instant.now()): Page<SellerBalanceRow> {
        syncSales(null, now)
        val total = jdbc.sql("select count(*) from seller where not is_platform and status in ('APPROVED', 'SUSPENDED')").query(Long::class.javaObjectType).single()
        val rows = jdbc.sql(
            """
            select s.id, s.shop_name,
                   coalesce((select sum(amount_paise) from seller_ledger_entry e where e.seller_id = s.id), 0) as balance,
                   coalesce((select sum(payout_paise) from seller_order so where so.seller_id = s.id and so.settled_at is null
                             and so.status not in ('CANCELLED', 'RETURNED')
                             and not exists (select 1 from seller_ledger_entry e where e.seller_order_id = so.id and e.type = 'SALE')), 0) as held,
                   (select max(created_at) from seller_ledger_entry e where e.seller_id = s.id and e.type = 'PAYOUT') as last_payout
            from seller s where not s.is_platform and s.status in ('APPROVED', 'SUSPENDED')
            order by balance desc, s.shop_name limit :l offset :o
            """.trimIndent(),
        ).param("l", page.safeLimit).param("o", page.offset).query { rs, _ ->
            SellerBalanceRow(rs.getObject("id", UUID::class.java), rs.getString("shop_name"), rs.getLong("balance"), rs.getLong("held"),
                rs.getTimestamp("last_payout")?.toInstant())
        }.list()
        return Page(rows, total, page.safePage, page.safeLimit)
    }

    // ================================================================ paying out

    /**
     * Pays a seller (bank transfer done outside): posts a PAYOUT for [amountPaise]
     * (default: the whole balance) and marks the credited orders settled.
     */
    @Transactional
    fun settle(adminId: UUID, sellerId: UUID, amountPaise: Long?, reference: String?, note: String?): Long {
        syncSales(sellerId)
        lock(sellerId)
        val balance = balance(sellerId)
        val amount = amountPaise ?: balance
        if (amount <= 0) throw ConflictException("Nothing is owed to this seller right now")
        if (amount > balance) throw BadRequestException("The payout is more than the ₹%.2f balance".format(balance / 100.0))
        insertEntry(sellerId, null, LedgerType.PAYOUT, amount, note ?: "Bank transfer", reference, adminId)
        jdbc.sql(
            """
            update seller_order set settled_at = now(), updated_at = now()
            where seller_id = :s and settled_at is null
              and exists (select 1 from seller_ledger_entry e where e.seller_order_id = seller_order.id and e.type = 'SALE')
            """.trimIndent(),
        ).param("s", sellerId).update()
        // A payout answers the seller's open withdrawal request, if there is one.
        jdbc.sql(
            "update withdrawal_request set status = 'COMPLETED', transaction_ref = :ref, completed_at = now(), decided_by = coalesce(decided_by, :a), decided_at = coalesce(decided_at, now()), updated_at = now() where seller_id = :s and status in ('PENDING', 'APPROVED')",
        ).param("ref", reference).param("a", adminId).param("s", sellerId).update()
        audit.record("admin", adminId, "PAYOUT", "seller", sellerId.toString(), after = mapOf("amountPaise" to amount, "reference" to reference))
        return balance(sellerId)
    }

    @Transactional
    fun adjust(adminId: UUID, sellerId: UUID, amountPaise: Long, note: String, reference: String?): Long {
        if (amountPaise == 0L) throw BadRequestException("An adjustment needs a non-zero amount")
        if (note.isBlank()) throw BadRequestException("Say why — the seller sees this note on their statement")
        lock(sellerId)
        insertEntry(sellerId, null, LedgerType.ADJUSTMENT, amountPaise, note.trim(), reference, adminId)
        audit.record("admin", adminId, "ADJUSTMENT", "seller", sellerId.toString(), after = mapOf("amountPaise" to amountPaise, "note" to note))
        return balance(sellerId)
    }

    // ================================================================ withdrawals

    @Transactional
    fun requestWithdrawal(sellerId: UUID, accountId: UUID, amountPaise: Long?): WithdrawalView {
        syncSales(sellerId)
        scope.enter(sellerId)
        lock(sellerId)
        val balance = balance(sellerId)
        val amount = amountPaise ?: balance
        if (amount <= 0) throw ConflictException("You have no balance to withdraw yet")
        if (amount > balance) throw BadRequestException("You can withdraw up to ₹%.2f".format(balance / 100.0))
        if (openWithdrawal(sellerId) != null) throw ConflictException("You already have a withdrawal in progress")
        val bank = jdbc.sql("select account_name, account_last4, ifsc, bank_name from seller_bank_account where seller_id = :s")
            .param("s", sellerId).query { rs, _ ->
                mapOf("accountName" to rs.getString("account_name"), "accountLast4" to rs.getString("account_last4"),
                    "ifsc" to rs.getString("ifsc"), "bankName" to rs.getString("bank_name"))
            }.optional().orElseThrow { ConflictException("Add your bank account before withdrawing") }
        val id = Ids.newId()
        jdbc.sql("insert into withdrawal_request (id, seller_id, amount_paise, bank_snapshot, requested_by) values (:id, :s, :a, cast(:b as jsonb), :by)")
            .param("id", id).param("s", sellerId).param("a", amount).param("b", json.writeValueAsString(bank)).param("by", accountId).update()
        return withdrawal(id)!!
    }

    fun withdrawals(sellerId: UUID?, status: String?, page: PageParams): Page<WithdrawalView> {
        val where = "where (cast(:s as uuid) is null or w.seller_id = :s) and (cast(:st as text) is null or w.status = :st)"
        val total = jdbc.sql("select count(*) from withdrawal_request w $where").param("s", sellerId).param("st", status).query(Long::class.javaObjectType).single()
        val items = jdbc.sql("$WITHDRAWAL_SELECT $where order by w.created_at desc limit :l offset :o")
            .param("s", sellerId).param("st", status).param("l", page.safeLimit).param("o", page.offset).query { rs, _ -> withdrawalView(rs) }.list()
        return Page(items, total, page.safePage, page.safeLimit)
    }

    @Transactional(readOnly = true)
    fun sellerWithdrawals(sellerId: UUID, page: PageParams): Page<WithdrawalView> {
        scope.enter(sellerId)
        return withdrawals(sellerId, null, page)
    }

    /** APPROVED (will pay), REJECTED (with a reason) or COMPLETED (paid: posts the PAYOUT). */
    @Transactional
    fun decideWithdrawal(adminId: UUID, id: UUID, status: String, reference: String?, reason: String?): WithdrawalView {
        val w = withdrawal(id) ?: throw NotFoundException("Withdrawal not found")
        if (w.status !in setOf("PENDING", "APPROVED")) throw ConflictException("This withdrawal is already ${w.status.lowercase()}")
        when (status) {
            "APPROVED" -> jdbc.sql("update withdrawal_request set status = 'APPROVED', decided_by = :a, decided_at = now(), updated_at = now() where id = :id")
                .param("a", adminId).param("id", id).update()
            "REJECTED" -> {
                if (reason.isNullOrBlank()) throw BadRequestException("Give the seller a reason")
                jdbc.sql("update withdrawal_request set status = 'REJECTED', rejection_reason = :r, decided_by = :a, decided_at = now(), updated_at = now() where id = :id")
                    .param("r", reason.trim()).param("a", adminId).param("id", id).update()
            }
            "COMPLETED" -> settle(adminId, w.sellerId, w.amountPaise, reference, "Withdrawal ${id.toString().take(8)}")
            else -> throw BadRequestException("status must be APPROVED, REJECTED or COMPLETED")
        }
        audit.record("admin", adminId, "WITHDRAWAL_$status", "withdrawal_request", id.toString())
        return withdrawal(id)!!
    }

    // ================================================================ helpers

    private data class SellerOrderRow(val id: UUID, val sellerId: UUID, val orderNumber: String, val payoutPaise: Long, val settledAt: Instant?, val isPlatform: Boolean)

    private fun sellerOrder(id: UUID): SellerOrderRow? =
        jdbc.sql("select so.id, so.seller_id, so.order_number, so.payout_paise, so.settled_at, s.is_platform from seller_order so join seller s on s.id = so.seller_id where so.id = :id")
            .param("id", id).query { rs, _ ->
                SellerOrderRow(rs.getObject("id", UUID::class.java), rs.getObject("seller_id", UUID::class.java), rs.getString("order_number"),
                    rs.getLong("payout_paise"), rs.getTimestamp("settled_at")?.toInstant(), rs.getBoolean("is_platform"))
            }.optional().orElse(null)

    /** Inserts a SALE / RETURN_REVERSAL at most once per seller order (also enforced by a unique index). */
    private fun insertOnce(sellerId: UUID, sellerOrderId: UUID, type: LedgerType, amount: Long, note: String, actor: UUID?): Boolean =
        jdbc.sql(
            """
            insert into seller_ledger_entry (id, seller_id, seller_order_id, type, amount_paise, note, created_by)
            values (:id, :s, :so, :t, :a, :n, :by)
            on conflict (seller_order_id, type) where type in ('SALE', 'RETURN_REVERSAL') do nothing
            """.trimIndent(),
        ).param("id", Ids.newId()).param("s", sellerId).param("so", sellerOrderId).param("t", type.name)
            .param("a", Ledger.signed(type, amount)).param("n", note).param("by", actor).update() == 1

    private fun insertEntry(sellerId: UUID, sellerOrderId: UUID?, type: LedgerType, amount: Long, note: String?, reference: String?, actor: UUID?) {
        jdbc.sql(
            "insert into seller_ledger_entry (id, seller_id, seller_order_id, type, amount_paise, reference, note, created_by) values (:id, :s, :so, :t, :a, :r, :n, :by)",
        ).param("id", Ids.newId()).param("s", sellerId).param("so", sellerOrderId).param("t", type.name)
            .param("a", Ledger.signed(type, amount)).param("r", reference).param("n", note).param("by", actor).update()
    }

    private fun openWithdrawal(sellerId: UUID): WithdrawalView? =
        jdbc.sql("$WITHDRAWAL_SELECT where w.seller_id = :s and w.status in ('PENDING', 'APPROVED')").param("s", sellerId)
            .query { rs, _ -> withdrawalView(rs) }.optional().orElse(null)

    private fun withdrawal(id: UUID): WithdrawalView? =
        jdbc.sql("$WITHDRAWAL_SELECT where w.id = :id").param("id", id).query { rs, _ -> withdrawalView(rs) }.optional().orElse(null)

    private fun withdrawalView(rs: java.sql.ResultSet) = WithdrawalView(
        rs.getObject("id", UUID::class.java), rs.getObject("seller_id", UUID::class.java), rs.getString("shop_name"),
        rs.getLong("amount_paise"), rs.getString("status"), rs.getString("transaction_ref"), rs.getString("rejection_reason"),
        rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("decided_at")?.toInstant(), rs.getTimestamp("completed_at")?.toInstant(),
    )

    companion object {
        private const val WITHDRAWAL_SELECT = "select w.*, s.shop_name from withdrawal_request w join seller s on s.id = w.seller_id"
    }
}
