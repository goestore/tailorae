package com.tailorae.order

import java.time.Instant
import java.util.UUID

enum class OrderStatus { PENDING, CONFIRMED, PROCESSING, READY_FOR_SHIPMENT, SHIPPED, DELIVERED, CANCELLED, RETURNED }

enum class PaymentStatus { PENDING, PAID, FAILED, REFUNDED, CANCELLED }

enum class PaymentMethod { COD, RAZORPAY }

/**
 * How a customer order and its per-seller parts move together — a port of
 * legacy-api/src/utils/order-status.ts with the same tests.
 *
 * The parent order follows its slowest shop: it is SHIPPED only when every
 * live shop has shipped, DELIVERED when the last parcel lands. A cancelled
 * shop does not hold the rest back; the order is cancelled only when all are.
 */
object OrderStatusRules {
    val FULFILMENT = listOf(
        OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING,
        OrderStatus.READY_FOR_SHIPMENT, OrderStatus.SHIPPED, OrderStatus.DELIVERED,
    )
    val VOID = setOf(OrderStatus.CANCELLED, OrderStatus.RETURNED)
    val CLOSED = setOf(OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.RETURNED)

    fun isVoid(s: OrderStatus) = s in VOID

    /** Position on the fulfilment path; -1 for the void statuses. */
    fun rank(s: OrderStatus) = FULFILMENT.indexOf(s)

    fun rollUp(subs: List<OrderStatus>): OrderStatus? {
        if (subs.isEmpty()) return null
        val live = subs.filterNot(::isVoid)
        if (live.isEmpty()) return if (OrderStatus.RETURNED in subs) OrderStatus.RETURNED else OrderStatus.CANCELLED
        return live.minBy(::rank)
    }

    /** The parent's new status after a shop moved, or null to leave it. Never goes backwards or reopens. */
    fun parentAfterSellerUpdate(current: OrderStatus, subs: List<OrderStatus>): OrderStatus? {
        if (isVoid(current)) return null
        val rolled = rollUp(subs) ?: return null
        if (rolled == current) return null
        if (isVoid(rolled)) return rolled
        return if (rank(rolled) > rank(current)) rolled else null
    }

    data class SellerState(val id: UUID, val status: OrderStatus, val shippedAt: Instant?, val deliveredAt: Instant?)

    data class SellerChange(val id: UUID, val status: OrderStatus, val shippedAt: Instant?, val deliveredAt: Instant?)

    /** Staff moved the whole order: bring every live shop up to it (never down), stamping dates. */
    fun cascade(next: OrderStatus, subs: List<SellerState>, now: Instant): List<SellerChange> = subs.mapNotNull { sub ->
        when {
            isVoid(sub.status) -> null
            isVoid(next) -> SellerChange(sub.id, next, null, null)
            rank(sub.status) >= rank(next) -> null
            else -> {
                val stamps = stamps(next, sub.shippedAt, sub.deliveredAt, now)
                SellerChange(sub.id, next, stamps.first, stamps.second)
            }
        }
    }

    /** Shipped / delivered dates to set when a shop reaches [next], keeping any already recorded. */
    fun stamps(next: OrderStatus, shippedAt: Instant?, deliveredAt: Instant?, now: Instant): Pair<Instant?, Instant?> {
        if (isVoid(next)) return null to null
        val shipped = if (rank(next) >= rank(OrderStatus.SHIPPED) && shippedAt == null) now else null
        val delivered = if (next == OrderStatus.DELIVERED && deliveredAt == null) now else null
        return shipped to delivered
    }

    /** What the payment status becomes when the order reaches [next]; null leaves it. */
    fun paymentAfter(next: OrderStatus, method: PaymentMethod, payment: PaymentStatus): PaymentStatus? = when (next) {
        OrderStatus.DELIVERED -> if (method == PaymentMethod.COD && payment == PaymentStatus.PENDING) PaymentStatus.PAID else null
        OrderStatus.CANCELLED -> when (payment) {
            PaymentStatus.PAID -> PaymentStatus.REFUNDED
            PaymentStatus.PENDING -> PaymentStatus.CANCELLED
            else -> null
        }
        OrderStatus.RETURNED -> if (payment == PaymentStatus.PAID) PaymentStatus.REFUNDED else null
        else -> null
    }

    /** Null when staff may move the order from [current] to [next]; otherwise why not. */
    fun staffTransitionError(current: OrderStatus, next: OrderStatus): String? = when {
        next == OrderStatus.RETURNED -> if (current == OrderStatus.DELIVERED) null else "Only a delivered order can be returned"
        current in CLOSED -> "Order status can no longer be changed (status: $current)"
        next == OrderStatus.CANCELLED -> null
        next == current -> "Order is already $current"
        rank(next) < rank(current) -> "An order cannot go back from $current to $next"
        else -> null
    }

    /** A seller may move their part forward along the path, or cancel it before it ships. */
    fun sellerTransitionError(current: OrderStatus, next: OrderStatus): String? = when {
        current in CLOSED -> "This order can no longer be changed"
        next == OrderStatus.RETURNED -> "Returns are handled by TAILORAE support"
        next == OrderStatus.CANCELLED -> if (rank(current) >= rank(OrderStatus.SHIPPED)) "A shipped order cannot be cancelled" else null
        next == current -> "Order is already $current"
        rank(next) < rank(current) -> "An order cannot go back from $current to $next"
        else -> null
    }
}
