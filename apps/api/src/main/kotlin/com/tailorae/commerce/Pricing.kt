package com.tailorae.commerce

import org.springframework.http.HttpStatus
import java.time.Instant
import java.util.UUID

/** Integer paise arithmetic. Percentages are basis points; halves round up. */
object Money {
    fun percentOf(amountPaise: Long, bp: Long): Long = (amountPaise * bp + 5_000) / 10_000
}

data class BulkTier(val minQty: Int, val maxQty: Int?, val pricePaise: Long)

object UnitPricing {
    /**
     * The unit price for one cart line: the variant's own price if it has one,
     * else the product's; then the best quantity break that applies (bulk
     * orders only); then any chosen customisation add-ons.
     */
    fun unitPrice(
        productPaise: Long,
        variantPaise: Long?,
        quantity: Int,
        tiers: List<BulkTier>,
        bulkAllowed: Boolean,
        addOnsPaise: Long,
    ): Long {
        val base = variantPaise ?: productPaise
        val tier = if (bulkAllowed) {
            tiers.filter { quantity >= it.minQty && (it.maxQty == null || quantity <= it.maxQty) }.minByOrNull { it.pricePaise }
        } else {
            null
        }
        return minOf(base, tier?.pricePaise ?: base) + addOnsPaise
    }
}

enum class DiscountType { PERCENTAGE, FIXED_AMOUNT }

data class CouponTerms(
    val id: UUID,
    val code: String,
    val discountType: DiscountType,
    /** Basis points for PERCENTAGE, paise for FIXED_AMOUNT. */
    val discountValue: Long,
    val minOrderPaise: Long,
    val maxDiscountPaise: Long?,
    val usageLimit: Int?,
    val usageCount: Int,
    val perCustomerLimit: Int,
    val startsAt: Instant,
    val endsAt: Instant,
    val isActive: Boolean,
    val applicableCategoryIds: Set<UUID>,
    val applicableProductIds: Set<UUID>,
    val requireBusiness: Boolean,
)

data class CouponLine(val productId: UUID, val categoryId: UUID, val unitPaise: Long, val quantity: Int)

data class CouponContext(
    val now: Instant = Instant.now(),
    /** Null when the buyer is unknown (a preview); the business check is skipped then. */
    val isBusiness: Boolean? = null,
    /** Null when the basket is unknown; restrictions then fall back to the whole subtotal. */
    val lines: List<CouponLine>? = null,
    /** How often this buyer already used the code; null when unknown. */
    val customerUses: Int? = null,
)

data class CouponOutcome(
    val ok: Boolean,
    val status: HttpStatus,
    val error: String?,
    val discountPaise: Long,
    val eligibleSubtotalPaise: Long?,
) {
    companion object {
        fun fail(status: HttpStatus, error: String) = CouponOutcome(false, status, error, 0, null)
    }
}

/** Port of legacy-api/src/utils/coupons.ts — the checks, in the same order and wording. */
object CouponRules {
    fun resolve(coupon: CouponTerms?, subtotalPaise: Long, ctx: CouponContext = CouponContext()): CouponOutcome {
        if (coupon == null || !coupon.isActive) return CouponOutcome.fail(HttpStatus.BAD_REQUEST, "Invalid or expired coupon code")
        if (coupon.startsAt.isAfter(ctx.now)) return CouponOutcome.fail(HttpStatus.BAD_REQUEST, "This coupon is not active yet")
        if (coupon.endsAt.isBefore(ctx.now)) return CouponOutcome.fail(HttpStatus.BAD_REQUEST, "This coupon has expired")
        if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
            return CouponOutcome.fail(HttpStatus.BAD_REQUEST, "This coupon has reached its usage limit")
        }
        if (coupon.perCustomerLimit > 0 && ctx.customerUses != null && ctx.customerUses >= coupon.perCustomerLimit) {
            return CouponOutcome.fail(
                HttpStatus.BAD_REQUEST,
                if (coupon.perCustomerLimit == 1) "You have already used this coupon"
                else "You have already used this coupon ${coupon.perCustomerLimit} times",
            )
        }
        if (coupon.requireBusiness && ctx.isBusiness == false) {
            return CouponOutcome.fail(HttpStatus.FORBIDDEN, "This coupon is only available to business accounts")
        }
        if (subtotalPaise < coupon.minOrderPaise) {
            return CouponOutcome.fail(HttpStatus.BAD_REQUEST, "Coupon requires a minimum order amount of ₹${rupees(coupon.minOrderPaise)}")
        }

        val restricted = coupon.applicableProductIds.isNotEmpty() || coupon.applicableCategoryIds.isNotEmpty()
        var eligible = subtotalPaise
        if (restricted && ctx.lines != null) {
            eligible = ctx.lines
                .filter { it.productId in coupon.applicableProductIds || it.categoryId in coupon.applicableCategoryIds }
                .sumOf { it.unitPaise * it.quantity }
            if (eligible <= 0) return CouponOutcome.fail(HttpStatus.BAD_REQUEST, "This coupon does not apply to anything in your basket")
        }

        var discount = when (coupon.discountType) {
            DiscountType.PERCENTAGE -> Money.percentOf(eligible, coupon.discountValue).let { d ->
                coupon.maxDiscountPaise?.let { minOf(d, it) } ?: d
            }
            DiscountType.FIXED_AMOUNT -> coupon.discountValue
        }
        discount = minOf(discount, eligible)
        return CouponOutcome(true, HttpStatus.OK, null, discount, eligible)
    }

    private fun rupees(paise: Long) = if (paise % 100 == 0L) "${paise / 100}" else "%.2f".format(paise / 100.0)
}
