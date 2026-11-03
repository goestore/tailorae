package com.tailorae.notification

import com.tailorae.common.ProcessedEvents
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URLEncoder
import java.util.UUID

/**
 * Acknowledges a custom-wear quote request to the customer and alerts staff.
 *
 * Reads the event as JSON (the `custom-wear.quote.requested` contract) rather
 * than importing the custom-wear module's classes. The two mails are separate
 * consumers (separate groups), so a failed staff alert is retried without
 * mailing the customer twice.
 */
@Component
class CustomWearEmails(
    private val mailer: Mailer,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
    private val props: MailProperties,
) {
    @KafkaListener(topics = [TOPIC], groupId = "notification")
    @Transactional
    fun onQuoteRequested(message: String) {
        val event = json.readTree(message)
        if (!processed.firstTime("notification.custom-wear-quote", eventId(event))) return
        val p = event.path("payload")
        val lines = lines(p)
        if (lines.isEmpty()) return
        val email = p.path("email").asString()
        val statusUrl = "${props.web}/custom-wear/quotes?reference=${enc(lines.first().reference)}&email=${enc(email)}"
        mailer.send(email, EmailTemplates.customWearQuoteReceived(p.path("customerName").asString(), lines, statusUrl))
    }

    @KafkaListener(topics = [TOPIC], groupId = "notification-staff")
    @Transactional
    fun onQuoteRequestedStaff(message: String) {
        val event = json.readTree(message)
        if (!processed.firstTime("notification.custom-wear-quote-staff", eventId(event))) return
        val staff = props.adminEmail.trim()
        val p = event.path("payload")
        val lines = lines(p)
        if (staff.isEmpty() || lines.isEmpty()) return
        val contact = buildString {
            append(p.path("customerName").asString())
            p.text("company")?.let { append(" ($it)") }
            append(" <${p.path("email").asString()}>")
            p.text("phone")?.let { append(", $it") }
        }
        val location = listOfNotNull(p.text("country"), p.text("postcode")).joinToString(" ")
        mailer.send(
            staff,
            EmailTemplates.customWearQuoteForStaff(contact, location, p.text("requiredBy"), lines, p.path("artworkCount").asInt(), "${props.web}/admin/custom-wear"),
        )
    }

    private fun lines(p: JsonNode) = p.path("quotes").elementsList().map { q ->
        QuoteMailLine(
            reference = q.path("reference").asString(),
            productName = q.path("productName").asString(),
            sku = q.path("sku").asString(),
            quantity = q.path("quantity").asInt(),
            colorName = q.text("colorName"),
            sizes = q.path("sizes").elementsList().map { it.asString() },
        )
    }

    private fun eventId(event: JsonNode) = UUID.fromString(event.path("eventId").asString())

    private fun JsonNode.text(field: String): String? = path(field).takeIf { it.isString }?.asString()?.takeIf { it.isNotBlank() }

    private fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)

    companion object {
        const val TOPIC = "custom-wear.quote.requested"
    }
}
