package com.tailorae.notification

import jakarta.mail.Multipart
import jakarta.mail.Part
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import org.mockito.ArgumentMatcher
import org.mockito.ArgumentMatchers.argThat
import org.mockito.Mockito.mockingDetails
import org.mockito.Mockito.timeout
import org.mockito.Mockito.verify
import org.springframework.mail.javamail.JavaMailSender

/**
 * Reads what the mocked [JavaMailSender] was asked to send. The mock is shared
 * by every integration test and consumers run asynchronously, so messages are
 * always picked out by recipient (and subject) rather than counted globally.
 */
object MailCapture {

    /** Waits (Mockito `timeout`) until [count] HTML mails reached [address] matching [subject], then returns them. */
    fun await(mail: JavaMailSender, address: String, subject: String = "", count: Int = 1, timeoutMs: Long = 25_000): List<MimeMessage> {
        verify(mail, timeout(timeoutMs).atLeast(count)).send(to(address, subject))
        return sent(mail, address, subject)
    }

    /**
     * A matcher for an HTML mail to [address]. A typed class rather than a lambda,
     * so Mockito skips the `SimpleMailMessage` sends (welcome mails) instead of
     * failing to cast them.
     */
    fun to(address: String, subject: String = ""): MimeMessage =
        argThat(MimeTo(address, subject)) ?: MimeMessage(jakarta.mail.Session.getInstance(java.util.Properties())) // Kotlin needs a non-null stand-in

    private class MimeTo(private val address: String, private val subject: String) : ArgumentMatcher<MimeMessage> {
        override fun matches(argument: MimeMessage?) = argument != null && matches(argument, address, subject)
        override fun type(): Class<*> = MimeMessage::class.java
    }

    /** Everything sent so far in this test to [address] whose subject contains [subject]. */
    fun sent(mail: JavaMailSender, address: String, subject: String = ""): List<MimeMessage> =
        mockingDetails(mail).invocations
            .filter { it.method.name == "send" }
            .flatMap { it.arguments.toList() }
            .filterIsInstance<MimeMessage>()
            .filter { matches(it, address, subject) }

    fun text(message: MimeMessage): String = part(message, "text/plain") ?: ""

    fun html(message: MimeMessage): String = part(message, "text/html") ?: ""

    private fun matches(m: MimeMessage, address: String, subject: String) =
        (m.allRecipients ?: emptyArray()).any { (it as InternetAddress).address.equals(address, ignoreCase = true) } &&
            (m.subject ?: "").contains(subject)

    private fun part(p: Part, type: String): String? {
        val content = p.content
        if (content is Multipart) {
            for (i in 0 until content.count) part(content.getBodyPart(i), type)?.let { return it }
            return null
        }
        // The data handler knows the type before headers are written (the mock never calls saveChanges).
        val actual = p.dataHandler?.contentType ?: p.contentType
        return if (content is String && actual.lowercase().startsWith(type)) content else null
    }
}
