package com.tailorae.order

import com.tailorae.commerce.AddressRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

object OrderTopics {
    const val PLACED = "order.placed"
    const val STATUS_CHANGED = "order.status.changed"
    /** Money must go back: a whole order cancelled, a seller's part cancelled, or a return completed. */
    const val REFUND_DUE = "order.refund.due"
    /** An online order's payment was captured — its confirmation email goes out now. */
    const val PAID = "order.paid"

    val ALL = listOf(PLACED, STATUS_CHANGED, REFUND_DUE, PAID)
}

data class CheckoutRequest(
    /** A saved address of the shopper's, or… */
    val addressId: UUID? = null,
    /** …one typed at checkout. */
    @field:Valid val shippingAddress: AddressRequest? = null,
    @field:Valid val billingAddress: AddressRequest? = null,
    val paymentMethod: PaymentMethod,
    val couponCode: String? = null,
    @field:Size(max = 500) val notes: String? = null,
    /** Keep a typed address in the address book. */
    val saveAddress: Boolean = false,
)

data class ReturnRequestBody(
    val requestType: String = "RETURN",
    @field:Size(min = 1, max = 200) val reason: String,
    @field:Size(max = 2000) val description: String? = null,
    @field:Size(max = 6) val images: List<String> = emptyList(),
)

data class StatusUpdate(
    val status: OrderStatus,
    @field:Size(max = 500) val message: String? = null,
    @field:Size(max = 80) val trackingNumber: String? = null,
    @field:Size(max = 80) val carrier: String? = null,
)

data class ReturnDecision(
    val status: String,
    val refundPaise: Long? = null,
    @field:Size(max = 1000) val notes: String? = null,
)

data class OrderItemView(
    val id: UUID, val productId: UUID, val productSlug: String?, val variantId: UUID?, val sellerId: UUID, val name: String, val sku: String,
    val size: String?, val color: String?, val thumbnail: String?, val quantity: Int, val unitPaise: Long,
    val discountPaise: Long, val customization: Any?, val mockupImage: String?,
)

data class SellerPartView(
    val id: UUID, val orderNumber: String, val sellerId: UUID, val shopName: String, val status: OrderStatus,
    val totalPaise: Long, val trackingNumber: String?, val carrier: String?, val shippedAt: Instant?, val deliveredAt: Instant?,
)

data class TimelineView(val status: String, val message: String?, val createdAt: Instant)

data class ReturnView(
    val id: UUID, val requestType: String, val reason: String, val description: String?, val images: List<String>,
    val status: String, val refundPaise: Long?, val refundedAt: Instant?, val notes: String?, val createdAt: Instant,
)

data class OrderView(
    val id: UUID,
    val orderNumber: String,
    val customerId: UUID,
    val status: OrderStatus,
    val paymentStatus: PaymentStatus,
    val paymentMethod: PaymentMethod,
    val shippingAddress: Map<String, Any?>,
    val billingAddress: Map<String, Any?>,
    val contactEmail: String,
    val subtotalPaise: Long,
    val discountPaise: Long,
    val couponCode: String?,
    val taxPaise: Long,
    val shippingPaise: Long,
    val totalPaise: Long,
    val refundedPaise: Long,
    val trackingNumber: String?,
    val carrier: String?,
    val deliveredAt: Instant?,
    val notes: String?,
    val adminNotes: String?,
    val paymentDueBy: Instant?,
    val createdAt: Instant,
    val items: List<OrderItemView>,
    val sellerOrders: List<SellerPartView>,
    val timeline: List<TimelineView>,
    val returnRequest: ReturnView?,
)

data class OrderSummaryView(
    val id: UUID, val orderNumber: String, val status: OrderStatus, val paymentStatus: PaymentStatus,
    val paymentMethod: PaymentMethod, val totalPaise: Long, val itemCount: Int, val firstItemName: String?,
    val firstItemThumbnail: String?, val customerEmail: String?, val createdAt: Instant,
    /** PENDING / APPROVED / REJECTED / COMPLETED when a return was requested; null otherwise. */
    val returnStatus: String? = null,
)

/** What a seller sees of an order: their lines, the shipping label, never the customer's contact details. */
data class SellerOrderView(
    val id: UUID, val orderNumber: String, val status: OrderStatus, val paymentMethod: String,
    val subtotalPaise: Long, val discountPaise: Long, val shippingPaise: Long, val totalPaise: Long,
    val commissionPaise: Long, val payoutPaise: Long, val trackingNumber: String?, val carrier: String?,
    val shippedAt: Instant?, val deliveredAt: Instant?, val settledAt: Instant?, val createdAt: Instant,
    val shipTo: Map<String, String?>, val notes: String?, val items: List<OrderItemView>,
)

// ------------------------------------------------------------ events

data class OrderPlaced(val orderId: UUID, val orderNumber: String, val customerId: UUID, val email: String, val totalPaise: Long, val paymentMethod: PaymentMethod)

data class OrderStatusChanged(val orderId: UUID, val orderNumber: String, val email: String, val status: OrderStatus)

data class OrderPaid(val orderId: UUID, val orderNumber: String, val email: String, val amountPaise: Long)

data class RefundDue(val orderId: UUID, val orderNumber: String, val amountPaise: Long, val reason: String)

/**
 * Whether online payment can be taken right now. The payment module provides
 * it; the order module only asks, so it never depends on payment.
 */
fun interface OnlinePaymentStatus {
    /** Null when online payment works; otherwise why not. */
    fun unavailableReason(): String?
}
