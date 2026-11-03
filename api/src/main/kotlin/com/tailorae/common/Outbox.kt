package com.tailorae.common

import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Kafka topics. One place, so a typo is a compile error rather than a consumer
 * listening to a topic nothing ever writes.
 */
object Topics {
    const val CUSTOMER_REGISTERED = "customer.registered"
    const val SELLER_REGISTERED = "seller.registered"

    val ALL = listOf(CUSTOMER_REGISTERED, SELLER_REGISTERED)
}

/**
 * Every event carries its own id, so a consumer can tell a redelivery from a
 * new event (see [ProcessedEvents]).
 */
data class EventEnvelope<T>(
    val eventId: UUID,
    val type: String,
    val occurredAt: Instant,
    val payload: T,
)

/**
 * The transactional outbox. A module records an event in the SAME database
 * transaction as the change it describes; [OutboxRelay] later copies it to
 * Kafka. So an event is published if and only if the change committed — no
 * "saved but never announced", no "announced but rolled back".
 */
@Component
class Outbox(private val jdbc: JdbcClient, private val json: JsonMapper) {

    @Transactional(propagation = Propagation.MANDATORY)
    fun <T : Any> record(topic: String, key: String, payload: T): UUID {
        val id = Ids.newId()
        val envelope = EventEnvelope(id, topic, Instant.now(), payload)
        jdbc.sql(
            """
            insert into outbox_event (id, topic, event_key, payload, created_at)
            values (:id, :topic, :key, cast(:payload as jsonb), now())
            """.trimIndent(),
        )
            .param("id", id)
            .param("topic", topic)
            .param("key", key)
            .param("payload", json.writeValueAsString(envelope))
            .update()
        return id
    }
}

@ConfigurationProperties("tailorae.outbox")
data class OutboxProperties(val batchSize: Int = 100, val sendTimeoutSeconds: Long = 10)

/**
 * Publishes committed outbox rows to Kafka, oldest first. `FOR UPDATE SKIP
 * LOCKED` lets several API instances run the relay without double-sending:
 * each claims a disjoint batch. A row is marked published only after Kafka
 * acknowledged it, so a crash re-sends rather than loses — consumers dedupe.
 */
@Component
class OutboxRelay(
    private val jdbc: JdbcClient,
    private val kafka: KafkaTemplate<String, String>,
    private val props: OutboxProperties,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${tailorae.outbox.poll-ms:1000}")
    @Transactional
    fun publishPending() {
        val rows = jdbc.sql(
            """
            select id, topic, event_key, payload::text as payload
            from outbox_event
            where published_at is null
            order by created_at
            limit :limit
            for update skip locked
            """.trimIndent(),
        )
            .param("limit", props.batchSize)
            .query { rs, _ ->
                Row(rs.getObject("id", UUID::class.java), rs.getString("topic"), rs.getString("event_key"), rs.getString("payload"))
            }
            .list()

        for (row in rows) {
            try {
                kafka.send(row.topic, row.key, row.payload).get(props.sendTimeoutSeconds, TimeUnit.SECONDS)
            } catch (e: Exception) {
                // Leave this and later rows for the next tick, preserving order.
                log.warn("Outbox publish failed for {} on {}: {}", row.id, row.topic, e.message)
                return
            }
            jdbc.sql("update outbox_event set published_at = now() where id = :id").param("id", row.id).update()
        }
    }

    private data class Row(val id: UUID, val topic: String, val key: String, val payload: String)
}

/**
 * Consumer-side idempotency: `firstTime` is true exactly once per
 * (consumer, event) pair, however many times Kafka redelivers the event.
 */
@Component
class ProcessedEvents(private val jdbc: JdbcClient) {
    @Transactional(propagation = Propagation.MANDATORY)
    fun firstTime(consumer: String, eventId: UUID): Boolean =
        jdbc.sql(
            """
            insert into processed_event (consumer, event_id, processed_at)
            values (:consumer, :eventId, now())
            on conflict do nothing
            """.trimIndent(),
        )
            .param("consumer", consumer)
            .param("eventId", eventId)
            .update() == 1
}
