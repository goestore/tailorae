package com.tailorae.engagement

import com.tailorae.common.ProcessedEvents
import com.tailorae.notification.EmailTemplates
import com.tailorae.notification.MailProperties
import com.tailorae.notification.Mailer
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.net.URLEncoder
import java.util.UUID

object EngagementTopics {
    /**
     * Published by the inventory/catalog module with payload `{productId, variantId?, quantity}`
     * (`quantity` = stock now on hand). Declared here too so this consumer's topic exists.
     */
    const val STOCK_CHANGED = "inventory.stock.changed"

    val ALL = listOf(STOCK_CHANGED)
}

/**
 * Tells everyone waiting that something is back (legacy `notifyRestocked`).
 *
 * A size-specific request is answered only by that size coming back; a
 * product-level request by any restock of the product. Requests are claimed
 * only when there is stock to claim them for, and each is stamped `notified_at`
 * once its mail is accepted, so a second stock change does not mail the same
 * people again. A mail that fails stays pending for the next restock instead of
 * re-sending the whole batch on retry.
 */
@Component
class RestockEmails(
    private val jdbc: JdbcClient,
    private val mailer: Mailer,
    private val props: MailProperties,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @KafkaListener(topics = [EngagementTopics.STOCK_CHANGED], groupId = "engagement")
    @Transactional
    fun onStockChanged(message: String) {
        val event = json.readTree(message)
        if (!processed.firstTime("engagement.restock", UUID.fromString(event.path("eventId").asString()))) return
        val payload = event.path("payload")
        val productId = runCatching { UUID.fromString(payload.path("productId").asString()) }.getOrNull() ?: return
        val variantId = payload.path("variantId").takeIf { it.isString && it.asString().isNotBlank() }
            ?.let { runCatching { UUID.fromString(it.asString()) }.getOrNull() }
        if (payload.path("quantity").asLong(0) <= 0) return

        val waiting = jdbc.sql(
            """
            select n.id, n.email, p.name, p.slug, coalesce(v.size, v.name) as size
            from stock_notification n
            join product p on p.id = n.product_id and p.status = 'ACTIVE'
            left join product_variant v on v.id = n.variant_id
            where n.product_id = :p and n.notified_at is null
              and ${if (variantId != null) "(n.variant_id = :v or n.variant_id is null)" else "n.variant_id is null"}
            order by n.created_at
            for update of n skip locked
            """.trimIndent(),
        )
            .param("p", productId)
            .apply { if (variantId != null) param("v", variantId) }
            .query { rs, _ -> Waiting(rs.getObject("id", UUID::class.java), rs.getString("email"), rs.getString("name"), rs.getString("slug"), rs.getString("size")) }
            .list()
        if (waiting.isEmpty()) return

        // Sequential on purpose: a restock can wake hundreds of shoppers, and a burst gets the domain rate-limited.
        val told = waiting.filter { w ->
            val url = "${props.web}/products/${URLEncoder.encode(w.slug, Charsets.UTF_8)}"
            mailer.trySend(w.email, EmailTemplates.backInStock(w.productName, w.size, url))
        }
        if (told.isNotEmpty()) {
            jdbc.sql("update stock_notification set notified_at = now() where id in (:ids)").param("ids", told.map { it.id }).update()
        }
        log.info("Restock of {}: told {} of {} waiting", productId, told.size, waiting.size)
    }

    private data class Waiting(val id: UUID, val email: String, val productName: String, val slug: String, val size: String?)
}
