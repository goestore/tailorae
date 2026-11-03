package com.tailorae.order

import com.tailorae.commerce.PurchaseVerifier
import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.SellerScope
import com.tailorae.common.TopicSet
import com.tailorae.common.accountId
import com.tailorae.common.toResponse
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import com.tailorae.seller.SellerContext
import com.tailorae.seller.SellerPermission
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@Configuration
class OrderModuleConfig {
    @Bean
    fun orderTopics() = TopicSet(OrderTopics.ALL)

    @Bean
    fun orderPublicEndpoints() = PublicEndpoints.get("/api/track-order", "/api/checkout/config")
}

/** A review is "verified" when the reviewer has a delivered line of that product. */
@Component
class DeliveredPurchases(private val jdbc: JdbcClient) : PurchaseVerifier {
    override fun deliveredOrderFor(customerId: UUID, productId: UUID): UUID? =
        jdbc.sql(
            """
            select o.id from order_item i join customer_order o on o.id = i.order_id
            join seller_order so on so.id = i.seller_order_id
            where o.customer_id = :c and i.product_id = :p and so.status = 'DELIVERED'
            order by o.created_at desc limit 1
            """.trimIndent(),
        ).param("c", customerId).param("p", productId).query(UUID::class.java).optional().orElse(null)
}

@RestController
class CustomerOrderController(
    private val orders: OrderService,
    private val settings: com.tailorae.common.SystemSettings,
    private val onlinePayments: org.springframework.beans.factory.ObjectProvider<OnlinePaymentStatus>,
) {
    /** What the bag and checkout show before an order exists: shipping rule and payment options. */
    @GetMapping("/api/checkout/config")
    fun checkoutConfig(): ApiResponse<Map<String, Any?>> {
        val online = onlinePayments.ifAvailable?.unavailableReason()
        return ApiResponse.ok(
            mapOf(
                "freeShippingAbovePaise" to settings.long(com.tailorae.common.SystemSettings.FREE_SHIPPING_ABOVE_PAISE, 99_900),
                "flatShippingPaise" to settings.long(com.tailorae.common.SystemSettings.FLAT_SHIPPING_PAISE, 7_900),
                "returnWindowDays" to settings.int(com.tailorae.common.SystemSettings.SETTLEMENT_HOLD_DAYS, 7),
                "paymentMethods" to listOf(
                    mapOf("method" to "COD", "available" to true, "reason" to null),
                    mapOf("method" to "RAZORPAY", "available" to (onlinePayments.ifAvailable != null && online == null),
                        "reason" to (if (onlinePayments.ifAvailable == null) "Online payment is not available right now" else online)),
                ),
            ),
        )
    }

    @PostMapping("/api/orders")
    fun place(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: CheckoutRequest): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val order = orders.checkout(jwt.accountId(), body)
        val online = order.paymentMethod == PaymentMethod.RAZORPAY
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok(
                mapOf("order" to order, "payment" to mapOf("required" to online, "method" to order.paymentMethod)),
                if (online) "Order created — payment required" else "Order placed successfully",
            ),
        )
    }

    @GetMapping("/api/orders")
    fun mine(@AuthenticationPrincipal jwt: Jwt, @RequestParam(defaultValue = "1") page: Int, @RequestParam(defaultValue = "10") limit: Int) =
        orders.customerOrders(jwt.accountId(), PageParams(page, limit)).toResponse()

    @GetMapping("/api/orders/{id}")
    fun one(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: String) = ApiResponse.ok(mapOf("order" to orders.customerOrder(jwt.accountId(), id)))

    @PatchMapping("/api/orders/{id}/cancel")
    fun cancel(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID) =
        ApiResponse.ok(mapOf("order" to orders.customerCancel(jwt.accountId(), id)), "Order cancelled")

    @PatchMapping("/api/orders/{id}/return")
    fun requestReturn(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @Valid @RequestBody body: ReturnRequestBody) =
        ApiResponse.ok(mapOf("order" to orders.requestReturn(jwt.accountId(), id, body)), if (body.requestType.uppercase() == "EXCHANGE") "Exchange requested" else "Return requested")

    @GetMapping("/api/track-order")
    fun track(@RequestParam orderNumber: String, @RequestParam email: String) = ApiResponse.ok(orders.track(orderNumber, email))
}

data class SellerDashboard(
    val ordersToShip: Long,
    val ordersThisMonth: Long,
    val salesThisMonthPaise: Long,
    val lowStock: List<Map<String, Any?>>,
    val recentOrders: List<SellerOrderView>,
)

@Service
class SellerOrderService(private val orders: OrderService, private val scope: SellerScope, private val jdbc: JdbcClient) {
    @Transactional(readOnly = true)
    fun list(sellerId: UUID, status: OrderStatus?, page: PageParams): Page<SellerOrderView> {
        scope.enter(sellerId)
        return orders.sellerOrders(sellerId, status, page)
    }

    @Transactional(readOnly = true)
    fun one(sellerId: UUID, id: UUID): SellerOrderView {
        scope.enter(sellerId)
        return orders.sellerOrder(sellerId, id)
    }

    @Transactional(readOnly = true)
    fun dashboard(sellerId: UUID): SellerDashboard {
        scope.enter(sellerId)
        val stats = jdbc.sql(
            """
            select count(*) filter (where status in ('CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT')) as to_ship,
                   count(*) filter (where created_at >= date_trunc('month', now())) as this_month,
                   coalesce(sum(total_paise) filter (where created_at >= date_trunc('month', now()) and status not in ('CANCELLED', 'RETURNED')), 0) as sales
            from seller_order where seller_id = :s
            """.trimIndent(),
        ).param("s", sellerId).query { rs, _ -> Triple(rs.getLong("to_ship"), rs.getLong("this_month"), rs.getLong("sales")) }.single()
        val lowStock = jdbc.sql(
            """
            select p.id, p.name, p.sku, p.quantity, p.thumbnail from product p join seller s on s.id = p.seller_id
            where p.seller_id = :s and p.status = 'ACTIVE' and p.quantity <= s.low_stock_threshold order by p.quantity, p.name limit 10
            """.trimIndent(),
        ).param("s", sellerId).query { rs, _ ->
            mapOf("id" to rs.getObject("id"), "name" to rs.getString("name"), "sku" to rs.getString("sku"), "quantity" to rs.getInt("quantity"), "thumbnail" to rs.getString("thumbnail"))
        }.list()
        return SellerDashboard(stats.first, stats.second, stats.third, lowStock, orders.sellerOrders(sellerId, null, PageParams(1, 5)).items)
    }
}

@RestController
@RequestMapping("/api/seller")
class SellerOrderController(
    private val sellerOrders: SellerOrderService,
    private val orders: OrderService,
    private val context: SellerContext,
) {
    @GetMapping("/summary")
    fun summary(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(sellerOrders.dashboard(context.require(jwt, request, SellerPermission.VIEW).sellerId))

    @GetMapping("/orders")
    fun list(
        @AuthenticationPrincipal jwt: Jwt,
        request: HttpServletRequest,
        @RequestParam(required = false) status: OrderStatus?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ) = sellerOrders.list(context.require(jwt, request, SellerPermission.ORDERS).sellerId, status, PageParams(page, limit)).toResponse()

    @GetMapping("/orders/{id}")
    fun one(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID) =
        ApiResponse.ok(sellerOrders.one(context.require(jwt, request, SellerPermission.ORDERS).sellerId, id))

    /**
     * Moves the seller's part of an order. Runs unscoped because it also rolls
     * the parent order forward; every query is filtered by the caller's seller id.
     */
    @PatchMapping("/orders/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID, @Valid @RequestBody body: StatusUpdate): ApiResponse<SellerOrderView> {
        val seller = context.require(jwt, request, SellerPermission.ORDERS)
        orders.sellerStatus(seller.sellerId, seller.accountId, id, body)
        return ApiResponse.ok(sellerOrders.one(seller.sellerId, id), "Order updated")
    }
}

@RestController
@RequestMapping("/api/admin")
class AdminOrderController(private val orders: OrderService, private val access: AdminAccess, private val jdbc: JdbcClient) {
    @GetMapping("/orders")
    fun list(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: OrderStatus?,
        @RequestParam(required = false) paymentStatus: PaymentStatus?,
        @RequestParam(required = false) paymentMethod: PaymentMethod?,
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) customerId: UUID?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ): ResponseEntity<ApiResponse<Page<OrderSummaryView>>> {
        access.require(jwt, AdminPermission.SUPPORT, AdminPermission.FINANCE)
        return orders.adminOrders(status, paymentStatus, paymentMethod, q, PageParams(page, limit), customerId).toResponse()
    }

    @PatchMapping("/orders/{id}/payment")
    fun payment(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, String?>): ApiResponse<Map<String, OrderView>> {
        val admin = access.require(jwt, AdminPermission.FINANCE)
        val status = body["paymentStatus"]?.let { runCatching { PaymentStatus.valueOf(it.uppercase()) }.getOrNull() }
            ?: throw BadRequestException("paymentStatus must be PAID or REFUNDED")
        orders.setPaymentStatus(admin, id, status, body["note"] ?: "")
        return ApiResponse.ok(mapOf("order" to orders.view(id)), "Payment recorded")
    }

    @GetMapping("/orders/{id}")
    fun one(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, OrderView>> {
        access.require(jwt, AdminPermission.SUPPORT, AdminPermission.FINANCE)
        return ApiResponse.ok(mapOf("order" to orders.view(id)))
    }

    @PatchMapping("/orders/{id}/status")
    fun status(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @Valid @RequestBody body: StatusUpdate) =
        ApiResponse.ok(mapOf("order" to orders.staffStatus(access.require(jwt, AdminPermission.SUPPORT), id, body)), "Order updated")

    @PatchMapping("/orders/{id}/notes")
    fun notes(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, String?>): ApiResponse<Unit> {
        access.require(jwt, AdminPermission.SUPPORT)
        jdbc.sql("update customer_order set admin_notes = :n, updated_at = now() where id = :id").param("n", body["adminNotes"]).param("id", id).update()
        return ApiResponse(true, "Notes saved")
    }

    @GetMapping("/returns")
    fun returns(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) requestType: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ): ResponseEntity<ApiResponse<Page<Map<String, Any?>>>> {
        access.require(jwt, AdminPermission.SUPPORT)
        return orders.returns(status?.uppercase(), PageParams(page, limit), requestType?.uppercase()).toResponse()
    }

    @PatchMapping("/returns/{id}")
    fun decideReturn(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @Valid @RequestBody body: ReturnDecision): ApiResponse<Map<String, OrderView>> {
        val admin = access.require(jwt, AdminPermission.SUPPORT)
        if (body.status.uppercase() == "COMPLETED") access.require(jwt, AdminPermission.FINANCE, AdminPermission.SUPPORT)
        return ApiResponse.ok(mapOf("order" to orders.decideReturn(admin, id, body.copy(status = body.status.uppercase()))), "Return updated")
    }

    @PostMapping("/orders/{id}/cancel")
    fun cancel(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: Map<String, String?>?): ApiResponse<Map<String, OrderView>> {
        val admin = access.require(jwt, AdminPermission.SUPPORT)
        val reason = body?.get("reason")?.ifBlank { null } ?: throw BadRequestException("Give a reason — the customer sees it")
        return ApiResponse.ok(mapOf("order" to orders.cancel(id, "admin", admin, reason)), "Order cancelled")
    }
}
