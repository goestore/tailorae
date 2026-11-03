package com.tailorae.content

import com.tailorae.common.ProcessedEvents
import com.tailorae.seller.SellerTopics
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID

@ConfigurationProperties("tailorae.web")
data class RevalidateProperties(
    /** The web app's `POST /api/content/revalidate`, e.g. `http://localhost:3000/api/content/revalidate`. Blank = off. */
    val revalidateUrl: String = "",
    /** Shared with the web app's `CONTENT_REVALIDATE_SECRET`; the web refuses every call without it. */
    val revalidateSecret: String = "",
)

/**
 * Tells the storefront to drop a cached copy (legacy-api `utils/revalidate.ts`).
 *
 * The web caches published content under one tag per namespace, and the
 * brand/seller/product directories under fixed tags; without this a change is
 * correct in the database and invisible on the site until the cache expires.
 */
@Component
class StorefrontRevalidator(private val props: RevalidateProperties, private val json: JsonMapper) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val http: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build()

    /** Whether a hook is configured; when false every call is a no-op. */
    val enabled: Boolean get() = props.revalidateUrl.isNotBlank() && props.revalidateSecret.isNotBlank()

    fun namespace(namespace: String) = post(mapOf("namespace" to namespace))

    /** One of the web's allowlisted catalogue tags: `brands`, `sellers`, `products`. */
    fun tag(tag: String) = post(mapOf("tag" to tag))

    /**
     * False when the hook is off. Throws when the storefront refused or could not
     * be reached, so the consumer retries (and finally parks the event on its DLT)
     * instead of silently leaving the site stale.
     */
    private fun post(body: Map<String, String>): Boolean {
        if (!enabled) {
            log.debug("Storefront revalidation is not configured; skipping {}", body)
            return false
        }
        val request = HttpRequest.newBuilder(URI.create(props.revalidateUrl))
            .timeout(Duration.ofSeconds(3))
            .header("Content-Type", "application/json")
            .header("x-content-revalidate-secret", props.revalidateSecret)
            .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
            .build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) {
            throw IllegalStateException("Storefront refused revalidation of $body: HTTP ${response.statusCode()}")
        }
        return true
    }
}

/**
 * Revalidates the storefront after content publishes, product changes and seller
 * decisions. Its own consumer group, so it never competes with the notification
 * consumers on the same topics.
 */
@Component
class RevalidationListeners(
    private val revalidator: StorefrontRevalidator,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
) {
    @KafkaListener(topics = [ContentTopics.PUBLISHED], groupId = GROUP)
    @Transactional
    fun onContentPublished(message: String) {
        val event = json.readTree(message)
        if (!processed.firstTime("$GROUP.content-published", id(event))) return
        revalidator.namespace(event.path("payload").path("namespace").asString())
    }

    @KafkaListener(topics = [ContentTopics.CATALOG_PRODUCT_CHANGED], groupId = GROUP)
    @Transactional
    fun onProductChanged(message: String) {
        if (!processed.firstTime("$GROUP.product-changed", id(json.readTree(message)))) return
        revalidator.tag("products")
    }

    /** An approval, suspension or reinstatement changes the shop directory and which products are listed. */
    @KafkaListener(topics = [SellerTopics.APPLICATION_DECIDED], groupId = GROUP)
    @Transactional
    fun onSellerDecided(message: String) {
        if (!processed.firstTime("$GROUP.seller-decided", id(json.readTree(message)))) return
        revalidator.tag("sellers")
        revalidator.tag("products")
    }

    private fun id(event: tools.jackson.databind.JsonNode) = UUID.fromString(event.path("eventId").asString())

    companion object {
        const val GROUP = "content-revalidate"
    }
}
