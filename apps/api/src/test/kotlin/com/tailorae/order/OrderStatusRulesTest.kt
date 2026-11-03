package com.tailorae.order

import com.tailorae.order.OrderStatus.CANCELLED
import com.tailorae.order.OrderStatus.CONFIRMED
import com.tailorae.order.OrderStatus.DELIVERED
import com.tailorae.order.OrderStatus.PENDING
import com.tailorae.order.OrderStatus.PROCESSING
import com.tailorae.order.OrderStatus.RETURNED
import com.tailorae.order.OrderStatus.SHIPPED
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Ported from legacy-api/src/utils/order-status.test.ts. */
class OrderStatusRulesTest {
    private val r = OrderStatusRules
    private val now = Instant.parse("2026-10-20T12:00:00Z")

    @Test fun `orders the fulfilment path and keeps void statuses off it`() {
        assertTrue(r.rank(PENDING) < r.rank(SHIPPED) && r.rank(SHIPPED) < r.rank(DELIVERED))
        assertEquals(-1, r.rank(CANCELLED))
    }

    @Test fun `roll-up follows the slowest live shop`() {
        assertNull(r.rollUp(emptyList()))
        assertEquals(SHIPPED, r.rollUp(listOf(SHIPPED)))
        assertEquals(PROCESSING, r.rollUp(listOf(SHIPPED, PROCESSING, SHIPPED)))
        assertEquals(SHIPPED, r.rollUp(listOf(DELIVERED, SHIPPED)))
        assertEquals(SHIPPED, r.rollUp(listOf(CANCELLED, SHIPPED)))
        assertEquals(CANCELLED, r.rollUp(listOf(CANCELLED, CANCELLED)))
        assertEquals(RETURNED, r.rollUp(listOf(CANCELLED, RETURNED)))
    }

    @Test fun `the parent rolls forward only, and never reopens`() {
        assertNull(r.parentAfterSellerUpdate(CONFIRMED, listOf(SHIPPED, CONFIRMED)))
        assertEquals(SHIPPED, r.parentAfterSellerUpdate(CONFIRMED, listOf(SHIPPED, SHIPPED)))
        assertNull(r.parentAfterSellerUpdate(SHIPPED, listOf(PROCESSING)))
        assertNull(r.parentAfterSellerUpdate(CANCELLED, listOf(SHIPPED)))
        assertEquals(CANCELLED, r.parentAfterSellerUpdate(CONFIRMED, listOf(CANCELLED, CANCELLED)))
        assertNull(r.parentAfterSellerUpdate(SHIPPED, listOf(SHIPPED)))
    }

    @Test fun `cascading stamps delivery dates, keeps recorded ones, and never drags a shop back`() {
        val earlier = now.minusSeconds(3600)
        val subs = listOf(
            OrderStatusRules.SellerState(UUID.randomUUID(), PROCESSING, null, null),
            OrderStatusRules.SellerState(UUID.randomUUID(), DELIVERED, earlier, earlier),
            OrderStatusRules.SellerState(UUID.randomUUID(), CANCELLED, null, null),
        )
        val changes = r.cascade(DELIVERED, subs, now)
        assertEquals(1, changes.size)
        assertEquals(now, changes[0].deliveredAt)
        assertEquals(now, changes[0].shippedAt)
        assertEquals(2, r.cascade(CANCELLED, subs, now).size) // every live shop, not the cancelled one
    }

    @Test fun `stamps a shipment, both on a jump to delivered, nothing before dispatch`() {
        assertEquals(now to null, r.stamps(SHIPPED, null, null, now))
        assertEquals(now to now, r.stamps(DELIVERED, null, null, now))
        assertEquals(null to null, r.stamps(PROCESSING, null, null, now))
    }

    @Test fun `payment follows the order`() {
        assertEquals(PaymentStatus.PAID, r.paymentAfter(DELIVERED, PaymentMethod.COD, PaymentStatus.PENDING))
        assertNull(r.paymentAfter(DELIVERED, PaymentMethod.RAZORPAY, PaymentStatus.PAID))
        assertEquals(PaymentStatus.REFUNDED, r.paymentAfter(CANCELLED, PaymentMethod.RAZORPAY, PaymentStatus.PAID))
        assertEquals(PaymentStatus.CANCELLED, r.paymentAfter(CANCELLED, PaymentMethod.COD, PaymentStatus.PENDING))
        assertEquals(PaymentStatus.REFUNDED, r.paymentAfter(RETURNED, PaymentMethod.RAZORPAY, PaymentStatus.PAID))
    }

    @Test fun `staff transitions`() {
        assertNull(r.staffTransitionError(DELIVERED, RETURNED))
        assertNotNull(r.staffTransitionError(SHIPPED, RETURNED))
        assertNotNull(r.staffTransitionError(DELIVERED, CANCELLED))
        assertNull(r.staffTransitionError(SHIPPED, CANCELLED))
        assertNotNull(r.staffTransitionError(SHIPPED, PROCESSING))
        assertNotNull(r.staffTransitionError(SHIPPED, SHIPPED))
        assertNull(r.staffTransitionError(PENDING, SHIPPED))
    }

    @Test fun `sellers move forward and cannot cancel after shipping`() {
        assertNull(r.sellerTransitionError(CONFIRMED, SHIPPED))
        assertNotNull(r.sellerTransitionError(SHIPPED, CANCELLED))
        assertNotNull(r.sellerTransitionError(DELIVERED, RETURNED))
    }
}
