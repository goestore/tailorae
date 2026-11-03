package com.tailorae.engagement

import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import java.security.SecureRandom
import java.sql.ResultSet
import java.time.Instant
import java.util.Base64
import java.util.UUID

data class ContactRequestView(
    val id: UUID,
    val name: String,
    val email: String,
    val subject: String,
    val message: String,
    val status: String,
    val notes: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class SubscriberView(
    val id: UUID,
    val email: String,
    val source: String,
    val isSubscribed: Boolean,
    val unsubscribedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class StockItemRef(val id: UUID, val name: String, val sku: String, val quantity: Int)

data class StockNotificationView(
    val id: UUID,
    val productId: UUID,
    val variantId: UUID?,
    val email: String,
    val notifiedAt: Instant?,
    val createdAt: Instant,
    val product: StockItemRef?,
    val variant: StockItemRef?,
)

data class ListPagination(val page: Int, val limit: Int, val total: Long, val pages: Int)

/** Storefront capture rules (legacy-api `routes/contact.ts`, `newsletter.ts`, `stock-notify.ts`). */
object EngagementRules {
    private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    val CONTACT_STATUSES = listOf("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")

    fun isValidEmail(email: String) = email.length <= 254 && EMAIL.matches(email)

    fun normaliseEmail(raw: String?) = raw?.trim()?.lowercase() ?: ""

    data class Contact(val name: String, val email: String, val subject: String, val message: String)

    /** All four fields required; trimmed and cut to their column limits, as legacy. */
    fun contact(body: JsonNode?): Contact {
        fun text(field: String) = body?.get(field)?.takeIf { it.isString }?.asString()?.trim()?.takeIf { it.isNotEmpty() }
        val name = text("name")
        val email = text("email")
        val subject = text("subject")
        val message = text("message")
        if (name == null || email == null || subject == null || message == null) throw BadRequestException("Name, email, subject, and message are required.")
        val cleanEmail = email.lowercase()
        if (!Regex("^\\S+@\\S+\\.\\S+$").matches(cleanEmail)) throw BadRequestException("Enter a valid email address.")
        return Contact(name.take(120), cleanEmail.take(254), subject.take(180), message.take(5000))
    }
}

@Service
class ContactService(private val jdbc: JdbcClient, private val audit: Audit) {

    @Transactional
    fun create(body: JsonNode?, customerId: UUID?): ContactRequestView {
        val c = EngagementRules.contact(body)
        val id = Ids.newId()
        jdbc.sql("insert into contact_request (id, name, email, subject, message, customer_id) values (:id, :n, :e, :s, :m, :c)")
            .param("id", id).param("n", c.name).param("e", c.email).param("s", c.subject).param("m", c.message).param("c", customerId)
            .update()
        return get(id)
    }

    @Transactional(readOnly = true)
    fun list(status: String?, page: Int, limit: Int): Pair<List<ContactRequestView>, ListPagination> {
        val st = status?.uppercase()?.takeIf { it in EngagementRules.CONTACT_STATUSES }
        val where = if (st != null) "where status = :s" else ""
        val size = limit.coerceIn(1, 200)
        val p = page.coerceAtLeast(1)
        val params = if (st != null) mapOf("s" to st) else emptyMap()
        val total = jdbc.sql("select count(*) from contact_request $where").params(params).query(Long::class.javaObjectType).single()
        val rows = jdbc.sql("select * from contact_request $where order by created_at desc limit :l offset :o")
            .params(params).param("l", size).param("o", (p - 1) * size).query { rs, _ -> view(rs) }.list()
        return rows to ListPagination(p, size, total, ((total + size - 1) / size).toInt())
    }

    @Transactional
    fun update(adminId: UUID, id: UUID, body: JsonNode?): ContactRequestView {
        val status = body?.get("status")?.takeIf { it.isString }?.asString()
        if (status == null || status !in EngagementRules.CONTACT_STATUSES) throw BadRequestException("Invalid contact request status")
        val notes = body.get("notes")?.takeIf { it.isString }?.asString()
        val before = get(id)
        jdbc.sql("update contact_request set status = :s, notes = coalesce(:n, notes), updated_at = now() where id = :id")
            .param("s", status).param("n", notes?.take(5000)).param("id", id).update()
        audit.record("admin", adminId, "UPDATE", "contact_request", id.toString(), mapOf("status" to before.status), mapOf("status" to status))
        return get(id)
    }

    private fun get(id: UUID): ContactRequestView =
        jdbc.sql("select * from contact_request where id = :id").param("id", id).query { rs, _ -> view(rs) }
            .optional().orElseThrow { NotFoundException("Contact request not found") }

    private fun view(rs: ResultSet) = ContactRequestView(
        rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getString("email"), rs.getString("subject"),
        rs.getString("message"), rs.getString("status"), rs.getString("notes"),
        rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
    )
}

/**
 * Newsletter sign-ups. Subscribing is idempotent and never says whether an
 * address was already on the list, so the endpoint cannot enumerate who signed
 * up. Unsubscribing needs the subscriber's token (from the link in every mail),
 * not just the address.
 */
@Service
class NewsletterService(private val jdbc: JdbcClient, private val audit: Audit) {
    private val random = SecureRandom()

    @Transactional
    fun subscribe(rawEmail: String?, rawSource: String?) {
        val email = EngagementRules.normaliseEmail(rawEmail)
        if (!EngagementRules.isValidEmail(email)) throw BadRequestException("Enter a valid email address.")
        val source = rawSource?.trim()?.take(40)?.ifEmpty { null } ?: "footer"
        // Re-subscribing revives an unsubscribed address; the original source is kept for attribution.
        jdbc.sql(
            """
            insert into newsletter_subscriber (id, email, source, unsubscribe_token) values (:id, :e, :s, :t)
            on conflict ((lower(email))) do update set is_subscribed = true, unsubscribed_at = null,
                updated_at = case when newsletter_subscriber.is_subscribed then newsletter_subscriber.updated_at else now() end
            """.trimIndent(),
        ).param("id", Ids.newId()).param("e", email).param("s", source).param("t", token()).update()
    }

    /** False when the token matches nobody. */
    @Transactional
    fun unsubscribe(token: String?): Boolean {
        if (token.isNullOrBlank()) return false
        return jdbc.sql(
            "update newsletter_subscriber set is_subscribed = false, unsubscribed_at = coalesce(unsubscribed_at, now()), updated_at = now() where unsubscribe_token = :t",
        ).param("t", token.trim()).update() == 1
    }

    /** The token for an address, for building the unsubscribe link in a newsletter mail. */
    @Transactional(readOnly = true)
    fun unsubscribeToken(email: String): String? =
        jdbc.sql("select unsubscribe_token from newsletter_subscriber where lower(email) = lower(:e)").param("e", email)
            .query(String::class.java).optional().orElse(null)

    @Transactional(readOnly = true)
    fun list(subscribed: Boolean?, page: Int, limit: Int): Pair<List<SubscriberView>, ListPagination> {
        val where = if (subscribed != null) "where is_subscribed = :s" else ""
        val params = if (subscribed != null) mapOf("s" to subscribed) else emptyMap()
        val size = limit.coerceIn(1, 500)
        val p = page.coerceAtLeast(1)
        val total = jdbc.sql("select count(*) from newsletter_subscriber $where").params(params).query(Long::class.javaObjectType).single()
        val rows = jdbc.sql("select * from newsletter_subscriber $where order by created_at desc limit :l offset :o")
            .params(params).param("l", size).param("o", (p - 1) * size).query { rs, _ -> view(rs) }.list()
        return rows to ListPagination(p, size, total, ((total + size - 1) / size).toInt())
    }

    @Transactional
    fun setSubscribed(adminId: UUID, id: UUID, subscribed: Boolean): SubscriberView {
        val n = jdbc.sql(
            """
            update newsletter_subscriber set is_subscribed = :s,
                unsubscribed_at = case when :s2 then null else now() end, updated_at = now()
            where id = :id
            """.trimIndent(),
        ).param("s", subscribed).param("s2", subscribed).param("id", id).update()
        if (n == 0) throw NotFoundException("Subscriber not found")
        audit.record("admin", adminId, if (subscribed) "SUBSCRIBE" else "UNSUBSCRIBE", "newsletter_subscriber", id.toString())
        return jdbc.sql("select * from newsletter_subscriber where id = :id").param("id", id).query { rs, _ -> view(rs) }.single()
    }

    /** Every subscribed address as CSV, for the mailing tool. */
    @Transactional(readOnly = true)
    fun exportCsv(includeUnsubscribed: Boolean): String = buildString {
        append("email,source,is_subscribed,subscribed_at,unsubscribed_at\n")
        jdbc.sql("select * from newsletter_subscriber ${if (includeUnsubscribed) "" else "where is_subscribed"} order by created_at")
            .query { rs, _ -> view(rs) }.list().forEach { s ->
                append(listOf(s.email, s.source, s.isSubscribed.toString(), s.createdAt.toString(), s.unsubscribedAt?.toString() ?: "").joinToString(",") { csv(it) })
                append('\n')
            }
    }

    private fun csv(value: String): String {
        // A leading =, +, - or @ would run as a formula in a spreadsheet.
        val safe = if (value.firstOrNull() in setOf('=', '+', '-', '@')) "'$value" else value
        return if (safe.any { it == ',' || it == '"' || it == '\n' }) "\"" + safe.replace("\"", "\"\"") + "\"" else safe
    }

    private fun token() = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(24).also(random::nextBytes))

    private fun view(rs: ResultSet) = SubscriberView(
        rs.getObject("id", UUID::class.java), rs.getString("email"), rs.getString("source"), rs.getBoolean("is_subscribed"),
        rs.getTimestamp("unsubscribed_at")?.toInstant(), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
    )
}

/** "Notify me when this is back in stock" sign-ups (table `stock_notification`, V4). */
@Service
class StockNotifyService(private val jdbc: JdbcClient, private val audit: Audit) {

    @Transactional
    fun signUp(body: JsonNode?) {
        val productId = body?.get("productId")?.takeIf { it.isString && it.asString().isNotBlank() }?.asString()
            ?: throw BadRequestException("productId is required")
        val email = EngagementRules.normaliseEmail(body.get("email")?.takeIf { it.isString }?.asString())
        if (!EngagementRules.isValidEmail(email)) throw BadRequestException("Enter a valid email address.")
        val variantNode = body.get("variantId")
        if (variantNode != null && !variantNode.isNull && !(variantNode.isString)) throw BadRequestException("variantId must be a string")
        val product = uuid(productId) ?: throw NotFoundException("Product not found")
        val exists = jdbc.sql("select exists (select 1 from product where id = :id)").param("id", product).query(Boolean::class.javaObjectType).single()
        if (!exists) throw NotFoundException("Product not found")
        val variant = variantNode?.takeIf { it.isString && it.asString().isNotBlank() }?.asString()?.let { raw ->
            val id = uuid(raw) ?: throw NotFoundException("Variant not found")
            val ok = jdbc.sql("select exists (select 1 from product_variant where id = :v and product_id = :p)")
                .param("v", id).param("p", product).query(Boolean::class.javaObjectType).single()
            if (!ok) throw NotFoundException("Variant not found")
            id
        }
        // Signing up twice is not an error the shopper should see. A request that was
        // already answered by an earlier restock is re-armed for the next one.
        jdbc.sql(
            """
            insert into stock_notification (id, product_id, variant_id, email) values (:id, :p, :v, :e)
            on conflict on constraint stock_notification_uq do update set notified_at = null, created_at = now()
            where stock_notification.notified_at is not null
            """.trimIndent(),
        ).param("id", com.tailorae.common.Ids.newId()).param("p", product).param("v", variant).param("e", email).update()
    }

    /** Outstanding requests first: that is the working list. */
    @Transactional(readOnly = true)
    fun list(page: Int, limit: Int): Pair<List<StockNotificationView>, ListPagination> {
        val size = limit.coerceIn(1, 500)
        val p = page.coerceAtLeast(1)
        val total = jdbc.sql("select count(*) from stock_notification").query(Long::class.javaObjectType).single()
        val rows = jdbc.sql(
            """
            select n.*, p.name as p_name, p.sku as p_sku, p.quantity as p_qty, v.name as v_name, v.sku as v_sku, v.quantity as v_qty
            from stock_notification n join product p on p.id = n.product_id
            left join product_variant v on v.id = n.variant_id
            order by n.notified_at asc nulls first, n.created_at desc limit :l offset :o
            """.trimIndent(),
        ).param("l", size).param("o", (p - 1) * size).query { rs, _ -> view(rs) }.list()
        return rows to ListPagination(p, size, total, ((total + size - 1) / size).toInt())
    }

    @Transactional
    fun setNotified(adminId: UUID, id: UUID, notified: Boolean): StockNotificationView {
        val n = jdbc.sql("update stock_notification set notified_at = case when :n then now() else null end where id = :id")
            .param("n", notified).param("id", id).update()
        if (n == 0) throw NotFoundException("Request not found")
        audit.record("admin", adminId, if (notified) "MARK_NOTIFIED" else "REOPEN", "stock_notification", id.toString())
        return jdbc.sql(
            """
            select n.*, p.name as p_name, p.sku as p_sku, p.quantity as p_qty, v.name as v_name, v.sku as v_sku, v.quantity as v_qty
            from stock_notification n join product p on p.id = n.product_id left join product_variant v on v.id = n.variant_id
            where n.id = :id
            """.trimIndent(),
        ).param("id", id).query { rs, _ -> view(rs) }.single()
    }

    private fun uuid(raw: String) = runCatching { UUID.fromString(raw.trim()) }.getOrNull()

    private fun view(rs: ResultSet): StockNotificationView {
        val productId = rs.getObject("product_id", UUID::class.java)
        val variantId = rs.getObject("variant_id", UUID::class.java)
        return StockNotificationView(
            id = rs.getObject("id", UUID::class.java),
            productId = productId,
            variantId = variantId,
            email = rs.getString("email"),
            notifiedAt = rs.getTimestamp("notified_at")?.toInstant(),
            createdAt = rs.getTimestamp("created_at").toInstant(),
            product = StockItemRef(productId, rs.getString("p_name"), rs.getString("p_sku"), rs.getInt("p_qty")),
            variant = variantId?.let { StockItemRef(it, rs.getString("v_name"), rs.getString("v_sku"), rs.getInt("v_qty")) },
        )
    }
}
