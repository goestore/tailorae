package com.tailorae.content

import com.sun.net.httpserver.HttpServer
import tools.jackson.databind.json.JsonMapper
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The web revalidate hook, against a stand-in for the Next.js endpoint. */
class StorefrontRevalidatorTest {
    private val json = JsonMapper.builder().build()
    private val received = CopyOnWriteArrayList<Pair<String?, String>>()
    private var status = 200
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/api/content/revalidate") { exchange ->
            received += exchange.requestHeaders.getFirst("x-content-revalidate-secret") to String(exchange.requestBody.readAllBytes())
            exchange.sendResponseHeaders(status, -1)
            exchange.close()
        }
        start()
    }
    private val url = "http://127.0.0.1:${server.address.port}/api/content/revalidate"

    @AfterTest
    fun stop() = server.stop(0)

    @Test
    fun `posts the namespace or tag with the shared secret`() {
        val revalidator = StorefrontRevalidator(RevalidateProperties(url, "s3cret"), json)
        assertTrue(revalidator.enabled)
        assertTrue(revalidator.namespace("brand"))
        assertTrue(revalidator.tag("products"))
        assertEquals(listOf("s3cret" to """{"namespace":"brand"}""", "s3cret" to """{"tag":"products"}"""), received.toList())
    }

    @Test
    fun `is a no-op when not configured`() {
        val revalidator = StorefrontRevalidator(RevalidateProperties("", ""), json)
        assertFalse(revalidator.enabled)
        assertFalse(revalidator.namespace("brand"))
        assertFalse(StorefrontRevalidator(RevalidateProperties(url, ""), json).enabled)
        assertTrue(received.isEmpty())
    }

    @Test
    fun `a refusal throws so the consumer retries`() {
        status = 401
        assertFailsWith<IllegalStateException> { StorefrontRevalidator(RevalidateProperties(url, "wrong"), json).namespace("brand") }
    }
}
