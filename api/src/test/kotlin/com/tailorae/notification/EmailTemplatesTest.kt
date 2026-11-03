package com.tailorae.notification

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EmailTemplatesTest {

    @Test
    fun `rupees use Indian grouping and two decimals`() {
        assertEquals("₹0.00", EmailTemplates.rupees(0))
        assertEquals("₹1,234.50", EmailTemplates.rupees(123_450))
        assertEquals("₹12,34,567.89", EmailTemplates.rupees(123_456_789))
        assertEquals("-₹5.00", EmailTemplates.rupees(-500))
    }

    @Test
    fun `every message has the same content as text and as branded HTML`() {
        val mail = EmailTemplates.backInStock("Linen Kurta", "M", "https://tailorae.test/products/linen-kurta")
        assertEquals("Back in stock: Linen Kurta", mail.subject)
        assertTrue("Linen Kurta in M is available again." in mail.text)
        assertTrue("Shop it now: https://tailorae.test/products/linen-kurta" in mail.text)
        assertTrue(mail.text.trimEnd().endsWith("— TAILORAE"))
        assertTrue("#FECC00" in mail.html, "gold call to action")
        assertTrue("href=\"https://tailorae.test/products/linen-kurta\"" in mail.html)
        assertTrue("Inter," in mail.html)
    }

    @Test
    fun `user-supplied text is escaped and only http links are linked`() {
        val mail = EmailTemplates.sellerApplicationDecided("<script>x</script> & Co", "REJECTED", "Bad \"docs\"", "javascript:alert(1)")!!
        assertFalse("<script>" in mail.html)
        assertTrue("&lt;script&gt;x&lt;/script&gt; &amp; Co" in mail.html)
        assertTrue("Bad &quot;docs&quot;" in mail.html)
        val approved = EmailTemplates.sellerApplicationDecided("Loom", "APPROVED", null, "javascript:alert(1)")!!
        assertFalse("href=\"javascript" in approved.html)
    }

    @Test
    fun `seller decisions map to their own wording, review is not mailed`() {
        assertEquals("Loom is approved on TAILORAE", EmailTemplates.sellerApplicationDecided("Loom", "APPROVED", null, "u")!!.subject)
        assertEquals("We need a little more from Loom", EmailTemplates.sellerApplicationDecided("Loom", "NEEDS_INFO", "Upload GST", "u")!!.subject)
        assertTrue("> Upload GST" in EmailTemplates.sellerApplicationDecided("Loom", "NEEDS_INFO", "Upload GST", "u")!!.text)
        assertEquals("Loom is suspended", EmailTemplates.sellerApplicationDecided("Loom", "SUSPENDED", "x", "u")!!.subject)
        assertNull(EmailTemplates.sellerApplicationDecided("Loom", "UNDER_REVIEW", null, "u"))
    }

    @Test
    fun `order status mail exists only for statuses the shopper cares about`() {
        assertNull(EmailTemplates.orderStatusUpdate("TL-1", "Asha", "PENDING", "https://w"))
        val shipped = EmailTemplates.orderStatusUpdate("TL-1", "Asha", "SHIPPED", "https://w", "Delhivery", "DL123")!!
        assertEquals("Your order has shipped — TL-1", shipped.subject)
        assertTrue("Tracking: Delhivery DL123" in shipped.text)
        assertTrue("https://w/track-order?order=TL-1" in shipped.text)
    }

    @Test
    fun `the receipt lists items and totals`() {
        val mail = EmailTemplates.orderConfirmation(
            OrderMail(
                orderId = "o1", orderNumber = "TL-9", firstName = null,
                lines = listOf(OrderMailLine("Kurta", 2, 199_800)),
                subtotalPaise = 199_800, discountPaise = 10_000, discountCode = "FEST", shippingPaise = 0, totalPaise = 189_800,
                address = OrderMailAddress("Asha Rao", "12 Linen Lane", null, "Jaipur", "Rajasthan", "302001"),
            ),
            "https://w",
        )
        assertTrue("Hi Asha Rao," in mail.text)
        assertTrue("Kurta × 2 — ₹1,998.00" in mail.text)
        assertTrue("Discount (FEST): -₹100.00" in mail.text)
        assertTrue("Shipping: Free" in mail.text)
        assertTrue("https://w/invoice/o1" in mail.text)
    }

    @Test
    fun `security mails carry the link or, for a change notice, none`() {
        assertTrue("https://w/reset?t=1" in EmailTemplates.passwordReset("A", "https://w/reset?t=1", 30).text)
        assertTrue("30 minutes" in EmailTemplates.passwordReset("A", "https://w/reset?t=1", 30).text)
        assertFalse("href=" in EmailTemplates.passwordChanged("A", Instant.parse("2026-11-03T10:00:00Z")).html)
        assertTrue("Tue, 3 Nov 2026" in EmailTemplates.passwordChanged("A", Instant.parse("2026-11-03T10:00:00Z")).text)
    }

    @Test
    fun `custom wear acknowledgement lists every reference`() {
        val lines = listOf(
            QuoteMailLine("CWQ-2026-000001", "Classic Polo", "TL-1", 50, "Navy", listOf("M", "L")),
            QuoteMailLine("CWQ-2026-000002", "Hoodie", "TL-2", 20, null, emptyList()),
        )
        val mail = EmailTemplates.customWearQuoteReceived("Asha", lines, "https://w/custom-wear/quotes?reference=CWQ-2026-000001")
        assertEquals("We received your custom wear request — CWQ-2026-000001 (+1)", mail.subject)
        assertTrue("CWQ-2026-000001 — Classic Polo (TL-1) × 50, Navy, sizes M/L" in mail.text)
        assertTrue("CWQ-2026-000002 — Hoodie (TL-2) × 20" in mail.text)
    }
}
