package com.tailorae.notification

import com.tailorae.common.ProcessedEvents
import com.tailorae.seller.ApplicationDecided
import com.tailorae.seller.ApplicationSubmitted
import com.tailorae.seller.MemberInvited
import com.tailorae.seller.SellerStatus
import com.tailorae.seller.SellerTopics
import org.slf4j.LoggerFactory
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.net.URLEncoder
import java.util.UUID

/**
 * Seller onboarding mail: staff hear about each submitted application, the
 * owner hears the decision, and an invited teammate gets their link.
 *
 * Each handler runs in a transaction with [ProcessedEvents], so a redelivered
 * event is skipped; if the mail server refuses, the transaction rolls back, the
 * event is retried and finally parked on `<topic>.DLT`.
 */
@Component
class SellerEmails(
    private val mailer: Mailer,
    private val processed: ProcessedEvents,
    private val json: JsonMapper,
    private val props: MailProperties,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @KafkaListener(topics = [SellerTopics.APPLICATION_SUBMITTED], groupId = "notification")
    @Transactional
    fun onApplicationSubmitted(message: String) {
        val (eventId, event) = json.envelope(message, ApplicationSubmitted::class.java)
        if (!processed.firstTime("notification.seller-application-submitted", eventId)) return
        val to = props.adminEmail.trim()
        if (to.isEmpty()) {
            log.info("No tailorae.mail.admin-email configured; not announcing the application from {}", event.shopName)
            return
        }
        mailer.send(to, EmailTemplates.sellerApplicationSubmitted(event.shopName, event.ownerEmail, "${props.web}/admin/sellers?id=${event.sellerId}"))
    }

    @KafkaListener(topics = [SellerTopics.APPLICATION_DECIDED], groupId = "notification")
    @Transactional
    fun onApplicationDecided(message: String) {
        val (eventId, event) = json.envelope(message, ApplicationDecided::class.java)
        if (!processed.firstTime("notification.seller-application-decided", eventId)) return
        if (event.ownerEmail.isBlank()) return
        val console = if (event.status == SellerStatus.NEEDS_INFO) "${props.web}/seller/verification" else "${props.web}/seller"
        val mail = EmailTemplates.sellerApplicationDecided(event.shopName, event.status.name, event.note, console) ?: return
        mailer.send(event.ownerEmail, mail)
    }

    @KafkaListener(topics = [SellerTopics.MEMBER_INVITED], groupId = "notification")
    @Transactional
    fun onMemberInvited(message: String) {
        val (eventId, event) = json.envelope(message, MemberInvited::class.java)
        if (!processed.firstTime("notification.seller-member-invited", eventId)) return
        val link = "${props.web}/seller/invite?token=${URLEncoder.encode(event.token, Charsets.UTF_8)}"
        mailer.send(event.email, EmailTemplates.sellerMemberInvited(event.shopName, event.role.name, link))
    }
}

/** The elements of a JSON array node (empty for anything else). */
fun tools.jackson.databind.JsonNode.elementsList(): List<tools.jackson.databind.JsonNode> =
    if (isArray) (0 until size()).map { get(it) } else emptyList()

/** Reads an outbox `EventEnvelope` into its id and typed payload. */
fun <T> JsonMapper.envelope(message: String, payloadType: Class<T>): Pair<UUID, T> {
    val tree = readTree(message)
    return UUID.fromString(tree.path("eventId").asString()) to treeToValue(tree.path("payload"), payloadType)
}
