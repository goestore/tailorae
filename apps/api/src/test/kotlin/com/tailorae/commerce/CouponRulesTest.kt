package com.tailorae.commerce

import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Ported from legacy-api/src/utils/coupons.test.ts (₹ amounts → paise, % → basis points). */
class CouponRulesTest {
    private val now = Instant.parse("2026-10-01T00:00:00Z")
    private val p1 = UUID.randomUUID()
    private val p2 = UUID.randomUUID()
    private val p9 = UUID.randomUUID()
    private val jackets = UUID.randomUUID()
    private val mugs = UUID.randomUUID()

    private fun coupon(
        type: DiscountType = DiscountType.PERCENTAGE,
        value: Long = 1000,
        min: Long = 0,
        max: Long? = null,
        limit: Int? = null,
        used: Int = 0,
        perCustomer: Int = 1,
        ends: Instant = Instant.parse("2026-12-31T00:00:00Z"),
        active: Boolean = true,
        categories: Set<UUID> = emptySet(),
        products: Set<UUID> = emptySet(),
        business: Boolean = false,
    ) = CouponTerms(UUID.randomUUID(), "SAVE10", type, value, min, max, limit, used, perCustomer,
        Instant.parse("2026-01-01T00:00:00Z"), ends, active, categories, products, business)

    private fun line(product: UUID = p1, category: UUID = jackets, price: Long = 50_000, qty: Int = 1) = CouponLine(product, category, price, qty)

    private fun ctx(uses: Int? = null, business: Boolean? = null, lines: List<CouponLine>? = null) =
        CouponContext(now = now, isBusiness = business, lines = lines, customerUses = uses)

    @Test fun `takes a percentage off`() = assertEquals(10_000, CouponRules.resolve(coupon(), 100_000, ctx()).discountPaise)

    @Test fun `caps a percentage at maxDiscount`() =
        assertEquals(5_000, CouponRules.resolve(coupon(max = 5_000), 100_000, ctx()).discountPaise)

    @Test fun `never discounts past free`() =
        assertEquals(100_000, CouponRules.resolve(coupon(DiscountType.FIXED_AMOUNT, 500_000), 100_000, ctx()).discountPaise)

    @Test fun `refuses a code outside its dates or over its limit`() {
        assertFalse(CouponRules.resolve(coupon(active = false), 100_000, ctx()).ok)
        assertFalse(CouponRules.resolve(coupon(ends = Instant.parse("2026-09-01T00:00:00Z")), 100_000, ctx()).ok)
        assertFalse(CouponRules.resolve(coupon(limit = 5, used = 5), 100_000, ctx()).ok)
        assertFalse(CouponRules.resolve(coupon(min = 200_000), 100_000, ctx()).ok)
    }

    @Test fun `refuses a second use of a one-per-customer code`() =
        assertEquals("You have already used this coupon", CouponRules.resolve(coupon(), 100_000, ctx(uses = 1)).error)

    @Test fun `allows a use still inside the limit`() = assertTrue(CouponRules.resolve(coupon(perCustomer = 3), 100_000, ctx(uses = 2)).ok)

    @Test fun `names the limit when it is more than one`() =
        assertEquals("You have already used this coupon 3 times", CouponRules.resolve(coupon(perCustomer = 3), 100_000, ctx(uses = 3)).error)

    @Test fun `treats a limit of zero as no limit`() = assertTrue(CouponRules.resolve(coupon(perCustomer = 0), 100_000, ctx(uses = 99)).ok)

    @Test fun `cannot be checked by a preview that does not know the buyer`() = assertTrue(CouponRules.resolve(coupon(), 100_000, ctx()).ok)

    @Test fun `business codes refuse a retail buyer, allow a business one, and skip an unknown one`() {
        val trade = coupon(business = true)
        val refused = CouponRules.resolve(trade, 100_000, ctx(business = false))
        assertFalse(refused.ok)
        assertEquals(HttpStatus.FORBIDDEN, refused.status)
        assertTrue(CouponRules.resolve(trade, 100_000, ctx(business = true)).ok)
        assertTrue(CouponRules.resolve(trade, 100_000, ctx()).ok)
    }

    @Test fun `discounts only the products the code names`() {
        val r = CouponRules.resolve(coupon(products = setOf(p1)), 100_000, ctx(lines = listOf(line(p1, price = 40_000), line(p2, price = 60_000))))
        assertEquals(40_000, r.eligibleSubtotalPaise)
        assertEquals(4_000, r.discountPaise)
    }

    @Test fun `discounts only the categories the code names`() {
        val r = CouponRules.resolve(coupon(categories = setOf(jackets)), 100_000,
            ctx(lines = listOf(line(category = jackets, price = 80_000), line(p2, mugs, 20_000))))
        assertEquals(8_000, r.discountPaise)
    }

    @Test fun `counts a line that matches either list`() {
        val r = CouponRules.resolve(coupon(products = setOf(p1), categories = setOf(jackets)), 100_000,
            ctx(lines = listOf(line(p1, mugs, 30_000), line(p9, jackets, 70_000))))
        assertEquals(100_000, r.eligibleSubtotalPaise)
    }

    @Test fun `multiplies the line quantity into what is eligible`() =
        assertEquals(100_000, CouponRules.resolve(coupon(products = setOf(p1)), 100_000, ctx(lines = listOf(line(p1, price = 25_000, qty = 4)))).eligibleSubtotalPaise)

    @Test fun `clamps a fixed-amount code to what it actually applies to`() {
        val r = CouponRules.resolve(coupon(DiscountType.FIXED_AMOUNT, 50_000, products = setOf(p1)), 100_000,
            ctx(lines = listOf(line(p1, price = 30_000), line(p2, price = 70_000))))
        assertEquals(30_000, r.discountPaise)
    }

    @Test fun `declines when nothing in the basket qualifies`() =
        assertEquals("This coupon does not apply to anything in your basket",
            CouponRules.resolve(coupon(products = setOf(p1)), 50_000, ctx(lines = listOf(line(p2, mugs)))).error)

    @Test fun `still checks the minimum against the whole order`() =
        assertTrue(CouponRules.resolve(coupon(products = setOf(p1), min = 90_000), 100_000,
            ctx(lines = listOf(line(p1, price = 40_000), line(p2, price = 60_000)))).ok)

    @Test fun `falls back to the whole subtotal when the basket is unknown`() =
        assertEquals(10_000, CouponRules.resolve(coupon(products = setOf(p1)), 100_000, ctx()).discountPaise)

    @Test fun `unit price takes the cheapest applicable quantity break, plus add-ons`() {
        val tiers = listOf(BulkTier(10, 49, 45_000), BulkTier(50, null, 40_000))
        assertEquals(50_000, UnitPricing.unitPrice(50_000, null, 9, tiers, true, 0))
        assertEquals(45_000, UnitPricing.unitPrice(50_000, null, 10, tiers, true, 0))
        assertEquals(41_500, UnitPricing.unitPrice(50_000, null, 60, tiers, true, 1_500))
        assertEquals(52_000, UnitPricing.unitPrice(50_000, 52_000, 60, tiers, false, 0))
    }
}
