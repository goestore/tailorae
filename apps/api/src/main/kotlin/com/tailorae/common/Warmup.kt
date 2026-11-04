package com.tailorae.common

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.boot.web.server.context.WebServerApplicationContext
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Calls the storefront's own read endpoints a few times right after startup.
 *
 * A fresh JVM serves its first requests slowly — classes load, the JIT has
 * compiled nothing, Hibernate and Jackson build their plans and serializers on
 * first use — so without this the first shopper after a deploy waited about a
 * second per call. The requests go through the real HTTP stack (security
 * filters, controllers, JSON) on a background thread; readiness is not delayed.
 */
@Component
@ConditionalOnProperty("tailorae.warmup.enabled", havingValue = "true", matchIfMissing = true)
class Warmup {
    private val log = LoggerFactory.getLogger(javaClass)

    @EventListener
    fun onReady(event: ApplicationReadyEvent) {
        val port = (event.applicationContext as? WebServerApplicationContext)?.webServer?.port ?: return
        Thread.ofVirtual().name("warmup").start { warm(port) }
    }

    private fun warm(port: Int) {
        val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
        val started = System.nanoTime()
        try {
            repeat(ROUNDS) {
                for (path in PATHS) {
                    val request = HttpRequest.newBuilder(URI.create("http://localhost:$port$path"))
                        .header("Accept-Encoding", "gzip")
                        .timeout(Duration.ofSeconds(10))
                        .build()
                    client.send(request, HttpResponse.BodyHandlers.discarding())
                }
            }
            log.info("Warm-up finished in {} ms", (System.nanoTime() - started) / 1_000_000)
        } catch (e: Exception) {
            log.debug("Warm-up stopped early: {}", e.toString())
        }
    }

    private companion object {
        const val ROUNDS = 10

        /** What the storefront asks for on its busiest pages. */
        val PATHS = listOf(
            "/api/products?page=1&limit=24",
            "/api/products/facets/list",
            "/api/products/colors/list",
            "/api/products/brands/list",
            "/api/products/sellers/list",
            "/api/products/categories/list?tree=1",
            "/api/products/categories/home",
            "/api/products/search/q?q=shirt",
            "/api/content/home",
            "/api/content/brand",
            "/api/custom-wear/products",
            "/api/auth/session",
        )
    }
}
