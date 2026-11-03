package com.tailorae.finance

import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.math.ceil

/**
 * The money rules, ported from legacy-api/src/utils (commission, order-split,
 * settlement, ledger) and pinned by the same test cases. Everything is integer
 * paise; rates are basis points (1000 = 10%).
 */
object Commission {
    private const val MAX_DEPTH = 16

    private fun isRate(bp: Int?) = bp != null && bp in 0..10_000

    /** Platform stock pays nothing; else the seller override, else the category rate, else the default. */
    fun pick(isPlatform: Boolean, sellerOverrideBp: Int?, categoryBp: Int?, defaultBp: Int): Int = when {
        isPlatform -> 0
        isRate(sellerOverrideBp) -> sellerOverrideBp!!
        isRate(categoryBp) -> categoryBp!!
        isRate(defaultBp) -> defaultBp
        else -> 0
    }

    data class CategoryRow(val parentId: UUID?, val rateBp: Int?)

    /**
     * Nearest ancestor (or self) that sets a rate. Each category is loaded at
     * most once per resolver, and a cycle in the tree ends the walk instead of
     * looping.
     */
    class Resolver(private val load: (UUID) -> CategoryRow?) {
        private val resolved = HashMap<UUID, Int?>()

        fun categoryRate(categoryId: UUID?): Int? {
            if (categoryId == null) return null
            if (resolved.containsKey(categoryId)) return resolved[categoryId]
            val path = mutableListOf<UUID>()
            var cursor: UUID? = categoryId
            var rate: Int? = null
            while (cursor != null && path.size < MAX_DEPTH) {
                if (resolved.containsKey(cursor)) { rate = resolved[cursor]; break }
                if (cursor in path) break
                path += cursor
                val row = load(cursor) ?: break
                if (isRate(row.rateBp)) { rate = row.rateBp; break }
                cursor = row.parentId
            }
            path.forEach { resolved[it] = rate }
            return rate
        }

        fun rateFor(isPlatform: Boolean, sellerOverrideBp: Int?, categoryId: UUID?, defaultBp: Int): Int =
            if (isPlatform || isRate(sellerOverrideBp)) pick(isPlatform, sellerOverrideBp, null, defaultBp)
            else pick(false, sellerOverrideBp, categoryRate(categoryId), defaultBp)
    }
}

object OrderSplit {
    data class Line(val subtotalPaise: Long, val rateBp: Int)

    data class Group(val sellerId: UUID, val isPlatform: Boolean, val lines: List<Line>)

    data class LineAllocation(val subtotalPaise: Long, val discountPaise: Long, val rateBp: Int, val commissionPaise: Long)

    data class Allocation(
        val sellerId: UUID,
        val subtotalPaise: Long,
        val discountPaise: Long,
        val shippingPaise: Long,
        val totalPaise: Long,
        val commissionBp: Int,
        val commissionPaise: Long,
        val payoutPaise: Long,
        val lines: List<LineAllocation>,
    )

    /**
     * Splits [total] across [weights] in proportion, largest remainders first,
     * so the shares always sum to exactly [total]. All-zero weights spread it
     * evenly instead of dropping it.
     */
    fun proportional(total: Long, weights: List<Long>): List<Long> {
        if (weights.isEmpty()) return emptyList()
        if (total == 0L) return weights.map { 0L }
        val weightSum = weights.sum()
        if (weightSum <= 0) {
            val base = total / weights.size
            val shares = MutableList(weights.size) { base }
            var leftover = total - base * weights.size
            var i = 0
            while (leftover > 0) { shares[i] += 1; leftover -= 1; i = (i + 1) % weights.size }
            return shares
        }
        // Exact shares as fractions total*w/sum; floor them, then hand out the
        // leftover paise to the largest remainders.
        // BigInteger: total × weight can exceed a Long on very large orders.
        val t = total.toBigInteger()
        val sum = weightSum.toBigInteger()
        val exact = weights.map { (t * it.toBigInteger()).divideAndRemainder(sum) }
        val floors = exact.map { it[0].toLong() }
        val remainders = exact.mapIndexed { i, qr -> i to qr[1] }.sortedByDescending { it.second }
        val shares = floors.toMutableList()
        var leftover = total - floors.sum()
        var i = 0
        while (leftover > 0) { shares[remainders[i % remainders.size].first] += 1; leftover -= 1; i++ }
        return shares
    }

    /**
     * One allocation per seller. Discount and shipping are apportioned by
     * subtotal; commission is on each line's discounted value, never on
     * shipping; platform stock pays none.
     */
    fun allocate(groups: List<Group>, discountPaise: Long, shippingPaise: Long): List<Allocation> {
        if (groups.isEmpty()) return emptyList()
        val subtotals = groups.map { g -> g.lines.sumOf { it.subtotalPaise } }
        val discounts = proportional(discountPaise, subtotals)
        val shippings = proportional(shippingPaise, subtotals)
        return groups.mapIndexed { i, g ->
            val lineDiscounts = proportional(discounts[i], g.lines.map { it.subtotalPaise })
            val net = maxOf(0, subtotals[i] - discounts[i])
            val lines = g.lines.mapIndexed { j, line ->
                val rate = if (g.isPlatform) 0 else line.rateBp
                val lineNet = maxOf(0, line.subtotalPaise - lineDiscounts[j])
                LineAllocation(line.subtotalPaise, lineDiscounts[j], rate, (lineNet * rate + 5_000) / 10_000)
            }
            val commission = lines.sumOf { it.commissionPaise }
            Allocation(
                sellerId = g.sellerId,
                subtotalPaise = subtotals[i],
                discountPaise = discounts[i],
                shippingPaise = shippings[i],
                totalPaise = net + shippings[i],
                commissionBp = blendedBp(lines, net, commission),
                commissionPaise = commission,
                payoutPaise = net - commission,
                lines = lines,
            )
        }
    }

    private fun blendedBp(lines: List<LineAllocation>, net: Long, commission: Long): Int {
        if (net > 0) return ((commission * 10_000 + net / 2) / net).toInt()
        val weight = lines.sumOf { it.subtotalPaise }
        if (weight <= 0) return lines.firstOrNull()?.rateBp ?: 0
        return ((lines.sumOf { it.rateBp.toLong() * it.subtotalPaise } + weight / 2) / weight).toInt()
    }

    /** `TL-…-A`, `-B`, … `-Z`, `-AA`, … */
    fun sellerOrderNumber(orderNumber: String, index: Int): String {
        val suffix = if (index < 26) "${'A' + index}" else "${'A' + (index / 26 - 1)}${'A' + index % 26}"
        return "$orderNumber-$suffix"
    }
}

object Settlement {
    val UNPAYABLE = setOf("CANCELLED", "RETURNED")

    fun cutoff(now: Instant, holdDays: Int): Instant = now.minus(Duration.ofDays(holdDays.toLong()))

    /** Why a seller order is not payable yet, or null when it is. */
    fun holdReason(
        status: String,
        deliveredAt: Instant?,
        settledAt: Instant?,
        returnStatus: String?,
        now: Instant,
        holdDays: Int,
    ): String? {
        if (settledAt != null) return "Already settled"
        if (status in UNPAYABLE) return if (status == "CANCELLED") "Order cancelled" else "Order returned"
        if (status != "DELIVERED") return "Not delivered yet"
        if (deliveredAt == null) return "Delivery date not recorded"
        if (returnStatus != null && returnStatus != "REJECTED") return "Customer has opened a return"
        val cutoff = cutoff(now, holdDays)
        if (deliveredAt.isAfter(cutoff)) {
            val daysLeft = ceil(Duration.between(cutoff, deliveredAt).toMillis() / 86_400_000.0).toInt()
            return "In return window — $daysLeft more ${if (daysLeft == 1) "day" else "days"}"
        }
        return null
    }
}

enum class LedgerType { SALE, PAYOUT, RETURN_REVERSAL, ADJUSTMENT }

object Ledger {
    /** Each type carries its own sign whatever the caller passed; adjustments keep theirs. */
    fun signed(type: LedgerType, amountPaise: Long): Long = when (type) {
        LedgerType.SALE -> kotlin.math.abs(amountPaise)
        LedgerType.PAYOUT, LedgerType.RETURN_REVERSAL -> -kotlin.math.abs(amountPaise)
        LedgerType.ADJUSTMENT -> amountPaise
    }

    data class Entry(
        val id: UUID,
        val createdAt: Instant,
        val type: LedgerType,
        val orderNumber: String?,
        val reference: String?,
        val note: String?,
        val amountPaise: Long,
    )

    data class StatementLine(val entry: Entry, val balanceAfterPaise: Long)

    data class Statement(val openingPaise: Long, val closingPaise: Long, val lines: List<StatementLine>)

    fun withRunningBalance(openingPaise: Long, entries: List<Entry>): Statement {
        var running = openingPaise
        val lines = entries.map { running += it.amountPaise; StatementLine(it, running) }
        return Statement(openingPaise, running, lines)
    }

    /** CSV for a seller's accountant. Cells that a spreadsheet would run as a formula are defused. */
    fun csv(statement: Statement): String {
        fun cell(value: Any?): String {
            val text = value?.toString() ?: ""
            val safe = if (Regex("^[=+\\-@]").containsMatchIn(text) && !Regex("^-?\\d").containsMatchIn(text)) "'$text" else text
            return if (Regex("[\",\\n\\r]").containsMatchIn(safe)) "\"${safe.replace("\"", "\"\"")}\"" else safe
        }
        fun rupees(paise: Long) = "%.2f".format(paise / 100.0)
        val rows = mutableListOf(listOf("Date", "Type", "Order", "Reference", "Note", "Amount", "Balance"))
        rows += listOf("", "OPENING", "", "", "", "", rupees(statement.openingPaise))
        statement.lines.forEach { l ->
            rows += listOf(l.entry.createdAt.toString(), l.entry.type.name, l.entry.orderNumber ?: "", l.entry.reference ?: "",
                l.entry.note ?: "", rupees(l.entry.amountPaise), rupees(l.balanceAfterPaise))
        }
        rows += listOf("", "CLOSING", "", "", "", "", rupees(statement.closingPaise))
        return rows.joinToString("\r\n", postfix = "\r\n") { r -> r.joinToString(",") { cell(it) } }
    }
}
