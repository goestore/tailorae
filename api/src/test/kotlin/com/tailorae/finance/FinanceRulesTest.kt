package com.tailorae.finance

import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Ported from legacy commission / order-split / settlement / ledger tests (₹ → paise, % → bp). */
class OrderSplitTest {
    private val a = UUID.randomUUID()
    private val b = UUID.randomUUID()
    private val c = UUID.randomUUID()
    private val house = UUID.randomUUID()

    private fun one(seller: UUID, rateBp: Int, subtotalPaise: Long, platform: Boolean = false) =
        OrderSplit.Group(seller, platform, listOf(OrderSplit.Line(subtotalPaise, rateBp)))

    private val groups = listOf(one(a, 1000, 70_000), one(b, 1500, 30_000))

    @Test fun `splits exactly when the division is clean`() = assertEquals(listOf(5000L, 5000L), OrderSplit.proportional(10_000, listOf(5000, 5000)))

    @Test fun `never loses or invents a paisa on an uneven split`() = assertEquals(listOf(3334L, 3333L, 3333L), OrderSplit.proportional(10_000, listOf(1, 1, 1)))

    @Test fun `weights the split by subtotal`() {
        val shares = OrderSplit.proportional(9_999, listOf(7000, 3000))
        assertEquals(9_999, shares.sum())
        assertTrue(shares[0] > shares[1])
    }

    @Test fun `spreads evenly when every weight is zero`() = assertEquals(101, OrderSplit.proportional(101, listOf(0, 0)).sum())

    @Test fun `zero amount and empty basket`() {
        assertEquals(listOf(0L, 0L), OrderSplit.proportional(0, listOf(100, 200)))
        assertEquals(emptyList(), OrderSplit.proportional(500, emptyList()))
    }

    @Test fun `the parts sum to what the customer paid`() {
        val all = OrderSplit.allocate(groups, 10_000, 4_900)
        assertEquals(10_000, all.sumOf { it.discountPaise })
        assertEquals(4_900, all.sumOf { it.shippingPaise })
        assertEquals(100_000 - 10_000 + 4_900, all.sumOf { it.totalPaise })
    }

    @Test fun `reconciles on an amount that does not divide evenly`() {
        val all = OrderSplit.allocate(listOf(one(a, 1000, 1000), one(b, 1000, 1000), one(c, 1000, 1000)), 1000, 100)
        assertEquals(1000, all.sumOf { it.discountPaise })
        assertEquals(100, all.sumOf { it.shippingPaise })
    }

    @Test fun `commission is on the discounted value`() {
        val shopA = OrderSplit.allocate(groups, 10_000, 0)[0]
        assertEquals(7_000, shopA.discountPaise)
        assertEquals(6_300, shopA.commissionPaise)
        assertEquals(56_700, shopA.payoutPaise)
    }

    @Test fun `no commission on shipping`() {
        val x = OrderSplit.allocate(listOf(one(a, 1000, 10_000)), 0, 4_900)[0]
        assertEquals(1_000, x.commissionPaise)
        assertEquals(14_900, x.totalPaise)
        assertEquals(9_000, x.payoutPaise)
    }

    @Test fun `platform stock pays nothing`() {
        val h = OrderSplit.allocate(listOf(one(house, 1000, 50_000, platform = true)), 0, 0)[0]
        assertEquals(0, h.commissionPaise)
        assertEquals(0, h.commissionBp)
        assertEquals(50_000, h.payoutPaise)
    }

    @Test fun `a fully discounted basket never pays out negative`() {
        val all = OrderSplit.allocate(groups, 100_000, 0)
        all.forEach { assertTrue(it.payoutPaise >= 0); assertEquals(0, it.commissionPaise) }
        assertEquals(0, all.sumOf { it.totalPaise })
    }

    @Test fun `mixes platform stock and a seller`() {
        val mixed = OrderSplit.allocate(listOf(one(house, 0, 40_000, true), one(a, 2000, 60_000)), 0, 4_900)
        assertEquals(104_900, mixed.sumOf { it.totalPaise })
        assertEquals(0, mixed[0].commissionPaise)
        assertEquals(12_000, mixed[1].commissionPaise)
    }

    @Test fun `seller order numbers run A to Z then AA`() {
        assertEquals("TL-1-A", OrderSplit.sellerOrderNumber("TL-1", 0))
        assertEquals("TL-1-Z", OrderSplit.sellerOrderNumber("TL-1", 25))
        assertEquals("TL-1-AA", OrderSplit.sellerOrderNumber("TL-1", 26))
    }
}

class CommissionTest {
    @Test fun `platform pays nothing, overrides win, null is unset, zero is set, default last`() {
        assertEquals(0, Commission.pick(true, 2000, 1500, 1000))
        assertEquals(2000, Commission.pick(false, 2000, 1500, 1000))
        assertEquals(1500, Commission.pick(false, null, 1500, 1000))
        assertEquals(0, Commission.pick(false, 0, 1500, 1000))
        assertEquals(1000, Commission.pick(false, null, null, 1000))
    }

    @Test fun `inherits the nearest ancestor, reads each category once, survives cycles`() {
        val root = UUID.randomUUID(); val mid = UUID.randomUUID(); val leaf = UUID.randomUUID(); val zero = UUID.randomUUID()
        val loop1 = UUID.randomUUID(); val loop2 = UUID.randomUUID()
        val rows = mapOf(
            root to Commission.CategoryRow(null, 1200), mid to Commission.CategoryRow(root, null), leaf to Commission.CategoryRow(mid, null),
            zero to Commission.CategoryRow(root, 0), loop1 to Commission.CategoryRow(loop2, null), loop2 to Commission.CategoryRow(loop1, null),
        )
        var loads = 0
        val resolver = Commission.Resolver { loads++; rows[it] }
        assertEquals(1200, resolver.rateFor(false, null, leaf, 1000))
        val after = loads
        assertEquals(1200, resolver.rateFor(false, null, leaf, 1000))
        assertEquals(after, loads, "each category is read once")
        assertEquals(0, resolver.rateFor(false, null, zero, 1000))
        assertEquals(1000, resolver.rateFor(false, null, loop1, 1000))
        assertEquals(1000, resolver.rateFor(false, null, UUID.randomUUID(), 1000))
        assertEquals(1000, resolver.rateFor(false, null, null, 1000))
        val before = loads
        resolver.rateFor(false, 500, leaf, 1000)
        resolver.rateFor(true, null, UUID.randomUUID(), 1000)
        assertEquals(before, loads, "no reads for an overridden shop or platform stock")
    }
}

class SettlementTest {
    private val now = Instant.parse("2026-10-20T12:00:00Z")
    private fun daysAgo(d: Long) = now.minus(Duration.ofDays(d))
    private fun hold(status: String = "DELIVERED", delivered: Instant? = daysAgo(8), settled: Instant? = null, ret: String? = null) =
        Settlement.holdReason(status, delivered, settled, ret, now, 7)

    @Test fun `clears a delivery past the window`() = assertNull(hold())
    @Test fun `holds inside the window and says how long is left`() = assertEquals("In return window — 3 more days", hold(delivered = daysAgo(4)))
    @Test fun `singular on the last day`() = assertEquals("In return window — 1 more day", hold(delivered = daysAgo(6)))
    @Test fun `holds anything not delivered`() = assertEquals("Not delivered yet", hold("SHIPPED"))
    @Test fun `never pays cancelled or returned`() {
        assertEquals("Order cancelled", hold("CANCELLED"))
        assertEquals("Order returned", hold("RETURNED"))
    }
    @Test fun `will not pay twice`() = assertEquals("Already settled", hold(settled = daysAgo(1)))
    @Test fun `holds while a return is open, pays once it is rejected`() {
        assertEquals("Customer has opened a return", hold(ret = "PENDING"))
        assertNull(hold(ret = "REJECTED"))
    }
    @Test fun `no recorded date means hold`() = assertEquals("Delivery date not recorded", hold(delivered = null))
    @Test fun `the boundary is payable`() = assertNull(hold(delivered = daysAgo(7)))
}

class LedgerTest {
    @Test fun `each type forces its sign`() {
        assertEquals(500, Ledger.signed(LedgerType.SALE, -500))
        assertEquals(-500, Ledger.signed(LedgerType.PAYOUT, 500))
        assertEquals(-500, Ledger.signed(LedgerType.RETURN_REVERSAL, 500))
        assertEquals(-200, Ledger.signed(LedgerType.ADJUSTMENT, -200))
    }

    @Test fun `statement runs the balance and the CSV defuses formulas`() {
        fun e(type: LedgerType, amount: Long, note: String?) = Ledger.Entry(UUID.randomUUID(), Instant.parse("2026-10-01T00:00:00Z"), type, "TL-1-A", null, note, amount)
        val stmt = Ledger.withRunningBalance(1_000, listOf(e(LedgerType.SALE, 50_000, "Order, \"one\""), e(LedgerType.PAYOUT, -20_000, "=HYPERLINK(1)")))
        assertEquals(31_000, stmt.closingPaise)
        assertEquals(51_000, stmt.lines[0].balanceAfterPaise)
        val lines = Ledger.csv(stmt).trim().split("\r\n")
        assertEquals(5, lines.size)
        assertTrue(lines[2].contains("\"Order, \"\"one\"\"\""))
        assertTrue(lines[3].contains("'=HYPERLINK(1)"))
        assertTrue(lines[3].contains("-200.00"))
    }
}
