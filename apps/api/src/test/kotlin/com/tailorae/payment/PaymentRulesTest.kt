package com.tailorae.payment

import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** Ported from legacy payment-signature / payment-webhook tests. */
class PaymentRulesTest {
    private val json = JsonMapper.builder().build()

    @Test fun `joins the ids with a pipe in Razorpay's order`() = assertEquals("order_1|pay_1", RazorpaySignatures.checkoutBody("order_1", "pay_1"))

    @Test fun `produces the documented lowercase hex digest and depends on the secret`() {
        val a = RazorpaySignatures.hmacHex("order_1|pay_1".toByteArray(), "secret")
        assertTrue(Regex("^[0-9a-f]{64}$").matches(a))
        assertTrue(a != RazorpaySignatures.hmacHex("order_1|pay_1".toByteArray(), "other"))
    }

    @Test fun `hex comparison is strict about everything but case`() {
        assertTrue(RazorpaySignatures.hexEquals("abcd", "ABCD"))
        assertFalse(RazorpaySignatures.hexEquals("abcd", "abce"))
        assertFalse(RazorpaySignatures.hexEquals("abcd", "abcdef"))
        assertFalse(RazorpaySignatures.hexEquals("", ""))
        assertFalse(RazorpaySignatures.hexEquals("zz", "zz"))
    }

    @Test fun `accepts the genuine handshake and refuses anything missing`() {
        val sig = RazorpaySignatures.hmacHex("order_1|pay_1".toByteArray(), "s3cret")
        assertTrue(RazorpaySignatures.checkoutValid("order_1", "pay_1", sig, "s3cret"))
        assertFalse(RazorpaySignatures.checkoutValid("order_1", "pay_2", sig, "s3cret"))
        assertFalse(RazorpaySignatures.checkoutValid("order_1", "pay_1", sig, ""))
        assertFalse(RazorpaySignatures.checkoutValid(null, "pay_1", sig, "s3cret"))
    }

    @Test fun `webhook signature is over the raw bytes`() {
        val body = """{"event":"payment.captured"}""".toByteArray()
        val sig = RazorpaySignatures.hmacHex(body, "wh")
        assertTrue(RazorpaySignatures.webhookValid(body, sig, "wh"))
        assertFalse(RazorpaySignatures.webhookValid("""{"event": "payment.captured"}""".toByteArray(), sig, "wh"))
        assertFalse(RazorpaySignatures.webhookValid(ByteArray(0), sig, "wh"))
    }

    @Test fun `decides what a webhook asks for`() {
        val capture = Webhooks.decide(json.readTree("""{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"order_1","amount":5000,"notes":{"orderNumber":"TL-1"}}}}}"""))
        assertIs<WebhookAction.Capture>(capture)
        assertEquals("orderNumber" to "TL-1", Webhooks.orderReference(capture))

        val failed = Webhooks.decide(json.readTree("""{"event":"payment.failed","payload":{"payment":{"entity":{"id":"pay_2","amount":5000,"error_description":"Card declined","notes":{"orderId":"abc"}}}}}"""))
        assertIs<WebhookAction.Fail>(failed)
        assertEquals("Card declined", failed.reason)
        assertEquals("id" to "abc", Webhooks.orderReference(failed))

        val refund = Webhooks.decide(json.readTree("""{"event":"refund.processed","payload":{"refund":{"entity":{"id":"rfnd_1","payment_id":"pay_1","amount":2500}}}}"""))
        assertIs<WebhookAction.Refund>(refund)
        assertEquals(2500, refund.amountPaise)

        assertIs<WebhookAction.Ignore>(Webhooks.decide(json.readTree("""{"event":"order.paid"}""")))
        assertIs<WebhookAction.Ignore>(Webhooks.decide(json.readTree("""{"event":"payment.captured","payload":{}}""")))
        assertIs<WebhookAction.Ignore>(Webhooks.decide(json.readTree("[]")))
    }
}
