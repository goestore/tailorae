package com.tailorae.notification

import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Component
import java.util.Properties

@ConfigurationProperties("tailorae.mail")
data class MailProperties(
    val from: String = "TAILORAE <no-reply@tailorae.com>",
    val webUrl: String = "http://localhost:3000",
    /** Where staff alerts go: new seller applications, custom-wear quote requests. Blank sends none. */
    val adminEmail: String = "admin@tailorae.com",
) {
    /** [webUrl] without a trailing slash, for building links. */
    val web: String get() = webUrl.trimEnd('/')
}

/**
 * Sends a rendered [Email] as `multipart/alternative`: the plain-text part for
 * clients that never render HTML, the branded HTML part for everyone else.
 */
@Component
class Mailer(private val sender: JavaMailSender, private val props: MailProperties) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** Throws when the mail server refuses, so a Kafka consumer retries (then parks the event on its DLT). */
    fun send(to: String, email: Email) {
        // A mocked sender returns no message; a detached one serves just as well for sending.
        val message: MimeMessage = sender.createMimeMessage() ?: MimeMessage(Session.getInstance(Properties()))
        MimeMessageHelper(message, true, "UTF-8").apply {
            setFrom(props.from)
            setTo(to)
            setSubject(email.subject)
            setText(email.text, email.html)
        }
        sender.send(message)
        log.info("Sent '{}' to {}", email.subject, to)
    }

    /** For batches: one bad address must not stop the rest. False when this one failed. */
    fun trySend(to: String, email: Email): Boolean =
        runCatching { send(to, email) }
            .onFailure { log.warn("Mail '{}' to {} failed: {}", email.subject, to, it.message) }
            .isSuccess
}
