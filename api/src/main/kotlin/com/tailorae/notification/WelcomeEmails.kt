package com.tailorae.notification

import com.tailorae.common.ProcessedEvents
import com.tailorae.common.Topics
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

@ConfigurationProperties("tailorae.mail")
data class MailProperties(val from: String = "TAILORAE <no-reply@tailorae.com>", val webUrl: String = "http://localhost:3000")

/**
 * Sends the welcome email when a customer or seller registers.
 *
 * It reads the event as plain JSON rather than importing identity's payload
 * classes, so this module depends on the event contract, not on identity's
 * code. Redeliveries are skipped by [ProcessedEvents]; a failure is retried
 * and then parked on the topic's `.DLT` (see [KafkaErrorHandling]).
 */
@Component
class WelcomeEmails(
    private val mail: JavaMailSender,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
    private val props: MailProperties,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @KafkaListener(topics = [Topics.CUSTOMER_REGISTERED], groupId = "notification")
    @Transactional
    fun onCustomerRegistered(message: String) {
        val event = json.readTree(message)
        if (!processed.firstTime("notification.welcome-customer", eventId(event))) return
        val payload = event.path("payload")
        send(
            to = payload.path("email").asString(),
            subject = "Welcome to TAILORAE",
            body = """
                Hi ${payload.path("firstName").asString()},

                Your TAILORAE account is ready. Browse clothing from independent sellers and
                brands, save favourites to your wishlist, and track every order in one place.

                ${props.webUrl}

                — TAILORAE
            """.trimIndent(),
        )
    }

    @KafkaListener(topics = [Topics.SELLER_REGISTERED], groupId = "notification")
    @Transactional
    fun onSellerRegistered(message: String) {
        val event = json.readTree(message)
        if (!processed.firstTime("notification.welcome-seller", eventId(event))) return
        val payload = event.path("payload")
        send(
            to = payload.path("email").asString(),
            subject = "Your TAILORAE seller account",
            body = """
                Hi ${payload.path("fullName").asString()},

                Your seller account is created. Next: add your business details, upload KYC
                documents and your bank account, then submit for review. Once approved you
                can start listing.

                ${props.webUrl}/seller

                — TAILORAE Seller Support
            """.trimIndent(),
        )
    }

    private fun eventId(event: JsonNode): UUID = UUID.fromString(event.path("eventId").asString())

    private fun send(to: String, subject: String, body: String) {
        mail.send(
            SimpleMailMessage().apply {
                setFrom(props.from)
                setTo(to)
                setSubject(subject)
                setText(body)
            },
        )
        log.info("Sent '{}' to {}", subject, to)
    }
}
