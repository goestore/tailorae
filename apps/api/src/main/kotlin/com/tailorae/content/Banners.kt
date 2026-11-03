package com.tailorae.content

import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

data class BannerView(
    val id: UUID,
    val title: String,
    val subtitle: String?,
    val image: String,
    val imageAlt: String?,
    val link: String?,
    val position: String,
    val type: String,
    val displayOrder: Int,
    val startDate: Instant?,
    val endDate: Instant?,
    val isActive: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
)

/**
 * Homepage/category banners (legacy-api `routes/admin.ts` /admin/banners).
 * Partial updates: a field left out is unchanged, an explicit null clears it.
 */
@Service
class BannerService(private val jdbc: JdbcClient, private val audit: Audit) {

    @Transactional(readOnly = true)
    fun all(): List<BannerView> =
        jdbc.sql("select * from banner order by display_order, created_at").query { rs, _ -> view(rs) }.list()

    /** What the storefront shows now: active and inside its date window. */
    @Transactional(readOnly = true)
    fun live(position: String?): List<BannerView> =
        jdbc.sql(
            """
            select * from banner where is_active
              and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
              ${if (position != null) "and position = :p" else ""}
            order by display_order, created_at
            """.trimIndent(),
        ).apply { if (position != null) param("p", position.uppercase()) }.query { rs, _ -> view(rs) }.list()

    @Transactional
    fun create(adminId: UUID, body: JsonNode?): BannerView {
        val fields = BannerFields.pick(body)
        val errors = fields.errors.toMutableList()
        if ((fields.values["title"] as String?).isNullOrBlank()) errors += "title is required"
        if ((fields.values["image"] as String?).isNullOrBlank()) errors += "image is required"
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))
        val id = Ids.newId()
        jdbc.sql("insert into banner (id, title, image) values (:id, :t, :i)")
            .param("id", id).param("t", fields.values["title"]).param("i", fields.values["image"]).update()
        apply(id, fields.values - "title" - "image")
        audit.record("admin", adminId, "CREATE", "banner", id.toString(), after = fields.values)
        return get(id)
    }

    @Transactional
    fun update(adminId: UUID, id: UUID, body: JsonNode?): BannerView {
        val fields = BannerFields.pick(body)
        if (fields.errors.isNotEmpty()) throw BadRequestException(fields.errors.joinToString(". "))
        if (fields.values.isEmpty()) throw BadRequestException("No valid fields provided to update")
        val before = get(id)
        apply(id, fields.values)
        audit.record("admin", adminId, "UPDATE", "banner", id.toString(), before, fields.values)
        return get(id)
    }

    @Transactional
    fun delete(adminId: UUID, id: UUID) {
        if (jdbc.sql("delete from banner where id = :id").param("id", id).update() == 0) throw NotFoundException("Banner not found")
        audit.record("admin", adminId, "DELETE", "banner", id.toString())
    }

    private fun apply(id: UUID, values: Map<String, Any?>) {
        for ((field, value) in values) {
            val column = BannerFields.COLUMNS.getValue(field)
            jdbc.sql("update banner set $column = :v, updated_at = now() where id = :id")
                .param("v", if (value is Instant) Timestamp.from(value) else value).param("id", id).update()
        }
    }

    private fun get(id: UUID): BannerView =
        jdbc.sql("select * from banner where id = :id").param("id", id).query { rs, _ -> view(rs) }
            .optional().orElseThrow { NotFoundException("Banner not found") }

    private fun view(rs: ResultSet) = BannerView(
        id = rs.getObject("id", UUID::class.java),
        title = rs.getString("title"),
        subtitle = rs.getString("subtitle"),
        image = rs.getString("image"),
        imageAlt = rs.getString("image_alt"),
        link = rs.getString("link"),
        position = rs.getString("position"),
        type = rs.getString("type"),
        displayOrder = rs.getInt("display_order"),
        startDate = rs.getTimestamp("starts_at")?.toInstant(),
        endDate = rs.getTimestamp("ends_at")?.toInstant(),
        isActive = rs.getBoolean("is_active"),
        createdAt = rs.getTimestamp("created_at").toInstant(),
        updatedAt = rs.getTimestamp("updated_at").toInstant(),
    )
}

/** Whitelist + validation of banner fields, as legacy `pickBannerFields`. */
object BannerFields {
    data class Picked(val values: Map<String, Any?>, val errors: List<String>)

    /** API field → column. Only these are ever written; the map is the whitelist. */
    val COLUMNS = mapOf(
        "title" to "title", "image" to "image", "position" to "position", "type" to "type",
        "subtitle" to "subtitle", "imageAlt" to "image_alt", "link" to "link",
        "displayOrder" to "display_order", "startDate" to "starts_at", "endDate" to "ends_at", "isActive" to "is_active",
    )

    fun pick(body: JsonNode?): Picked {
        val values = linkedMapOf<String, Any?>()
        val errors = mutableListOf<String>()
        if (body == null || !body.isObject) return Picked(values, listOf("Send the banner as a JSON object"))
        for (field in listOf("title", "image", "position", "type")) {
            val v = body.get(field) ?: continue
            if (!v.isString || v.asString().isBlank()) errors += "$field must be a non-empty string"
            else values[field] = v.asString().trim().let { if (field == "position" || field == "type") it.uppercase() else it }
        }
        for (field in listOf("subtitle", "imageAlt", "link")) {
            val v = body.get(field) ?: continue
            if (!v.isNull && !v.isString) errors += "$field must be a string"
            else values[field] = if (v.isNull) null else v.asString()
        }
        body.get("displayOrder")?.let { v ->
            if (!v.isIntegralNumber && !(v.isString && v.asString().toIntOrNull() != null)) errors += "displayOrder must be an integer"
            else values["displayOrder"] = if (v.isString) v.asString().toInt() else v.asInt()
        }
        for (field in listOf("startDate", "endDate")) {
            val v = body.get(field) ?: continue
            if (v.isNull) { values[field] = null; continue }
            val date = if (v.isString) parseDate(v.asString()) else null
            if (date == null) errors += "$field must be a valid date" else values[field] = date
        }
        body.get("isActive")?.let { v -> if (!v.isBoolean) errors += "isActive must be a boolean" else values["isActive"] = v.asBoolean() }
        return Picked(values, errors)
    }

    /** ISO instant (`2026-11-03T10:00:00Z`) or a calendar date (`2026-11-03`, midnight UTC). */
    fun parseDate(raw: String): Instant? =
        runCatching { Instant.parse(raw.trim()) }.getOrNull()
            ?: runCatching { LocalDate.parse(raw.trim()).atStartOfDay().toInstant(ZoneOffset.UTC) }.getOrNull()
            ?: runCatching { java.time.OffsetDateTime.parse(raw.trim()).toInstant() }.getOrNull()
}
