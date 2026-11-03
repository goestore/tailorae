package com.tailorae.order

import com.tailorae.common.Ids
import com.tailorae.finance.FinanceService
import com.tailorae.payment.GatewayPayment
import com.tailorae.payment.RazorpaySignatures
import com.tailorae.support.IntegrationTest
import com.tailorae.support.TestClient
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.anyLong
import org.mockito.ArgumentMatchers.anyMap
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.timeout
import org.mockito.Mockito.verify
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Checkout to payout, against real Postgres and Kafka: the split across shops,
 * stock, seller isolation, status roll-up, COD collection, Razorpay webhooks
 * (signed for real), refunds through Kafka, settlement and payouts, returns,
 * and the unpaid-order release job.
 */
class OrderFlowIntegrationTest : IntegrationTest() {

    @Autowired lateinit var jobs: OrderJobs
    @Autowired lateinit var finance: FinanceService

    private val platform = UUID.fromString("01900000-0000-7000-8000-000000000001")

    private val address = mapOf(
        "fullName" to "Asha Rao", "phone" to "+91 98450 00000", "line1" to "4 MG Road",
        "city" to "Bengaluru", "state" to "Karnataka", "postalCode" to "560001",
    )

    /** A listed product of [seller] in a category charging 15% commission. */
    private fun product(seller: UUID, pricePaise: Long, stock: Int = 10): UUID {
        val category = Ids.newId()
        jdbc.sql("insert into category (id, name, slug, commission_rate_bp) values (:id, :n, :s, 1500)")
            .param("id", category).param("n", unique("Kurtas")).param("s", unique("kurtas")).update()
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into product (id, seller_id, category_id, name, slug, sku, price_paise, quantity, status, moderation_status)
            values (:id, :s, :c, :n, :slug, :sku, :p, :q, 'ACTIVE', 'APPROVED')
            """.trimIndent(),
        ).param("id", id).param("s", seller).param("c", category).param("n", unique("Kurta")).param("slug", unique("kurta"))
            .param("sku", unique("SKU")).param("p", pricePaise).param("q", stock).update()
        return id
    }

    private fun stock(product: UUID) = jdbc.sql("select quantity from product where id = :p").param("p", product).query(Int::class.javaObjectType).single()

    private fun buy(shopper: TestClient, method: String, vararg lines: Pair<UUID, Int>): TestClient.Res {
        lines.forEach { (p, q) -> shopper.post("/api/cart/items", mapOf("productId" to p, "quantity" to q)).expect(201) }
        return shopper.post("/api/orders", mapOf("shippingAddress" to address, "paymentMethod" to method))
    }

    @Test
    fun `a two-shop COD order splits, ships, is collected, and pays the seller after the window`() {
        val (owner, sellerId) = approvedSeller()
        val kurta = product(sellerId, 60_000)
        val house = product(platform, 40_000)
        val shopper = customer()

        val order = buy(shopper, "COD", kurta to 2, house to 1).expect(201).data.get("order")
        // ₹1600 basket clears the free-shipping line.
        assertEquals(160_000, order.get("totalPaise").asLong())
        assertEquals(2, order.get("sellerOrders").size())
        assertEquals(8, stock(kurta))
        assertEquals(0, shopper.get("/api/cart").data.get("cart").get("items").size())

        // The seller sees their part: the label, never the customer's email.
        val part = owner.get("/api/seller/orders").expect(200).data.get("items").get(0)
        assertEquals(120_000, part.get("totalPaise").asLong())
        assertEquals(18_000, part.get("commissionPaise").asLong()) // 15% of ₹1200
        assertEquals("Asha Rao", part.get("shipTo").get("name").asString())
        assertFalse(part.toString().contains("@example.com"))
        val partId = part.get("id").asString()
        approvedSeller().first.get("/api/seller/orders/$partId").expect(404)

        owner.patch("/api/seller/orders/$partId", mapOf("status" to "SHIPPED")).expect(400) // tracking number required
        owner.patch("/api/seller/orders/$partId", mapOf("status" to "SHIPPED", "trackingNumber" to "AWB123", "carrier" to "Delhivery")).expect(200)
        val orderId = order.get("id").asString()
        assertEquals("PENDING", shopper.get("/api/orders/$orderId").data.get("order").get("status").asString()) // the platform part is behind

        admin().patch("/api/admin/orders/$orderId/status", mapOf("status" to "DELIVERED")).expect(200)
        val delivered = shopper.get("/api/orders/$orderId").data.get("order")
        assertEquals("DELIVERED", delivered.get("status").asString())
        assertEquals("PAID", delivered.get("paymentStatus").asString()) // cash collected on delivery

        // Inside the return window nothing is payable; after it, the payout is credited.
        assertEquals(0, owner.get("/api/seller/earnings").expect(200).data.get("balancePaise").asLong())
        jdbc.sql("update seller_order set delivered_at = now() - interval '8 days' where order_id = :o").param("o", UUID.fromString(orderId)).update()
        assertEquals(102_000, owner.get("/api/seller/earnings").expect(200).data.get("balancePaise").asLong())

        // Staff pay it; the balance clears and the statement shows both lines.
        admin().post("/api/admin/payouts/$sellerId/settle", mapOf("reference" to "UTR0001")).expect(200)
        assertEquals(0, owner.get("/api/seller/earnings").data.get("balancePaise").asLong())
        val csv = owner.get("/api/seller/earnings/statement?format=csv").expect(200).body
        assertTrue(csv.contains("SALE") && csv.contains("PAYOUT") && csv.contains("UTR0001"), csv)
    }

    @Test
    fun `a Razorpay order is paid by signed webhook once, and refunded through Kafka on cancel`() {
        val (_, sellerId) = approvedSeller()
        val kurta = product(sellerId, 150_000)
        val shopper = customer()
        doReturn("order_${unique("rzp")}").`when`(gateway).createOrder(anyLong(), anyString(), anyMap())
        doReturn("rfnd_1").`when`(gateway).refund(anyString(), anyLong(), anyMap())

        val order = buy(shopper, "RAZORPAY", kurta to 1).expect(201).data.get("order")
        val orderId = order.get("id").asString()
        val session = shopper.post("/api/payments/razorpay/create-order", mapOf("orderId" to orderId)).expect(200).data
        val gatewayOrder = session.get("gatewayOrderId").asString()

        // A forged webhook is refused before anything is read.
        val body = """{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"$gatewayOrder","amount":150000,"notes":{"orderId":"$orderId"}}}}}"""
        anonymous().apply { headers["X-Razorpay-Signature"] = "00ff" }.post("/api/payments/razorpay/webhook", body).expect(401)

        val signed = anonymous().apply { headers["X-Razorpay-Signature"] = RazorpaySignatures.hmacHex(body.toByteArray(), WEBHOOK_SECRET) }
        signed.post("/api/payments/razorpay/webhook", body).expect(200)
        signed.post("/api/payments/razorpay/webhook", body).expect(200) // redelivery: no second effect
        val paid = shopper.get("/api/orders/$orderId").data.get("order")
        assertEquals("PAID", paid.get("paymentStatus").asString())
        assertEquals("CONFIRMED", paid.get("status").asString())
        assertEquals(1, jdbc.sql("select count(*) from payment_event where order_id = :o and kind = 'CAPTURED'").param("o", UUID.fromString(orderId)).query(Long::class.javaObjectType).single())

        // The browser's verify call after the webhook is harmless too.
        doReturn(GatewayPayment("pay_1", gatewayOrder, 150_000, "captured")).`when`(gateway).fetchPayment("pay_1")
        val signature = RazorpaySignatures.hmacHex(RazorpaySignatures.checkoutBody(gatewayOrder, "pay_1").toByteArray(), RAZORPAY_SECRET)
        shopper.post("/api/payments/razorpay/verify", mapOf("razorpay_order_id" to gatewayOrder, "razorpay_payment_id" to "pay_1", "razorpay_signature" to signature)).expect(200)

        // Cancelling a paid order puts the stock back and refunds through the gateway.
        shopper.patch("/api/orders/$orderId/cancel").expect(200)
        assertEquals(10, stock(kurta))
        verify(gateway, timeout(20_000)).refund(anyString(), anyLong(), anyMap())
        val refunded = { shopper.get("/api/orders/$orderId").data.get("order").get("refundedPaise").asLong() }
        val deadline = System.currentTimeMillis() + 20_000
        while (refunded() != 150_000L && System.currentTimeMillis() < deadline) Thread.sleep(200)
        assertEquals(150_000, refunded())
    }

    @Test
    fun `an unpaid online order gives its stock back when the window closes`() {
        val (_, sellerId) = approvedSeller()
        val kurta = product(sellerId, 50_000, stock = 3)
        val order = buy(customer(), "RAZORPAY", kurta to 3).expect(201).data.get("order")
        assertEquals(0, stock(kurta))
        customer().post("/api/cart/items", mapOf("productId" to kurta, "quantity" to 1)).expect(400) // sold out meanwhile

        jdbc.sql("update customer_order set payment_due_by = now() - interval '1 minute' where id = :o").param("o", UUID.fromString(order.get("id").asString())).update()
        assertTrue(jobs.releaseUnpaid() >= 1)
        assertEquals(3, stock(kurta))
    }

    @Test
    fun `a completed return reverses a credited sale and restocks`() {
        val (owner, sellerId) = approvedSeller()
        val kurta = product(sellerId, 100_000)
        val shopper = customer()
        val orderId = buy(shopper, "COD", kurta to 1).expect(201).data.get("order").get("id").asString()
        val staff = admin()
        staff.patch("/api/admin/orders/$orderId/status", mapOf("status" to "DELIVERED")).expect(200)

        val ret = shopper.patch("/api/orders/$orderId/return", mapOf("reason" to "Too small")).expect(200).data.get("order").get("returnRequest")
        shopper.patch("/api/orders/$orderId/return", mapOf("reason" to "again")).expect(409)
        val returnId = ret.get("id").asString()

        // An open return holds the payout even past the window.
        jdbc.sql("update seller_order set delivered_at = now() - interval '9 days' where order_id = :o").param("o", UUID.fromString(orderId)).update()
        assertEquals(0, owner.get("/api/seller/earnings").data.get("balancePaise").asLong())
        assertTrue(owner.get("/api/seller/earnings").data.get("held").toString().contains("return"))

        staff.patch("/api/admin/returns/$returnId", mapOf("status" to "COMPLETED")).expect(200)
        assertEquals("RETURNED", shopper.get("/api/orders/$orderId").data.get("order").get("status").asString())
        assertEquals(10, stock(kurta))
        assertEquals(0, finance.balance(sellerId)) // never credited, so nothing to reverse
    }
}
