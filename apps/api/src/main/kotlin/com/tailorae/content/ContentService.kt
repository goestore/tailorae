package com.tailorae.content

import com.tailorae.common.Audit
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.Outbox
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/** A row as the admin editor sees it. */
data class ContentEntryView(
    val path: String,
    val value: JsonNode,
    val version: Int,
    val isPrivate: Boolean,
    val updatedById: UUID?,
    val updatedAt: Instant,
    val publishedAt: Instant?,
)

/** Just the pair the web's `resolveContent()` consumes (and the PUT body takes). */
data class StoredValue(val path: String, val value: JsonNode)

data class ContentStagesView(val namespace: String, val version: Int, val published: List<ContentEntryView>, val draft: List<ContentEntryView>)

data class DraftView(val namespace: String, val draft: List<ContentEntryView>)

data class PublishView(val namespace: String, val version: Int, val published: List<ContentEntryView>, val revalidated: Boolean, val publishedCount: Int)

data class PublicContentView(val namespace: String, val version: Int, val values: List<StoredValue>)

/** A publish as the audit log recorded it; replaying `before.values` through PUT + publish reverts it. */
data class PublishSnapshot(val version: Int, val values: List<StoredValue>)

data class PublishHistoryEntry(val publishedAt: Instant, val publishedById: UUID?, val before: PublishSnapshot?, val after: PublishSnapshot?)

data class ContentPublished(val namespace: String, val version: Int)

/**
 * Versioned storefront content (namespace + JSON pointer), ported from
 * legacy-api `routes/content.ts`.
 *
 * Drafts occupy version 0 — exactly one draft slot per path, so a save is an
 * upsert. Publishing promotes every draft of a namespace to the next version
 * with an UPDATE, never delete-and-insert, so a publish cannot remove content it
 * did not replace. The previous and new published sets are kept in the audit
 * log as `{version, values}` snapshots, which is what a revert replays.
 */
@Service
class ContentService(
    private val jdbc: JdbcClient,
    private val json: JsonMapper,
    private val audit: Audit,
    private val outbox: Outbox,
    private val revalidator: StorefrontRevalidator,
) {

    @Transactional(readOnly = true)
    fun stages(namespace: String): ContentStagesView {
        val rows = rows(namespace, status = null)
        val published = ContentRules.latestPerPath(rows.filter { it.status == "PUBLISHED" }, { it.view.path }, { it.view.version })
        return ContentStagesView(
            namespace = namespace,
            version = published.maxOfOrNull { it.view.version } ?: 0,
            published = published.map { it.view },
            draft = rows.filter { it.status == "DRAFT" }.map { it.view },
        )
    }

    @Transactional
    fun saveDraft(adminId: UUID, namespace: String, entries: List<ContentEntry>): DraftView {
        // One batch, one transaction: a partial save would leave a draft nobody composed.
        for (entry in entries) {
            jdbc.sql(
                """
                insert into content_value (id, namespace, path, value, status, version, is_private, updated_by)
                values (:id, :ns, :path, cast(:value as jsonb), 'DRAFT', 0, :private, :by)
                on conflict (namespace, path, version) do update set
                    value = excluded.value, is_private = excluded.is_private,
                    updated_by = excluded.updated_by, updated_at = now()
                """.trimIndent(),
            )
                .param("id", Ids.newId()).param("ns", namespace).param("path", entry.path)
                .param("value", json.writeValueAsString(entry.value)).param("private", entry.isPrivate)
                .param("by", adminId)
                .update()
        }
        return DraftView(namespace, rows(namespace, "DRAFT").map { it.view })
    }

    @Transactional
    fun publish(adminId: UUID, namespace: String): PublishView {
        // Serialises publishes of one namespace, so two cannot claim the same version.
        jdbc.sql("select 1 from (select pg_advisory_xact_lock(hashtext(:k))) as lock")
            .param("k", "content:$namespace").query(Int::class.javaObjectType).single()

        val drafts = rows(namespace, "DRAFT")
        if (drafts.isEmpty()) throw ConflictException("There is nothing to publish in this namespace")
        val before = publishedNow(namespace)
        val next = (
            jdbc.sql("select coalesce(max(version), 0) from content_value where namespace = :ns")
                .param("ns", namespace).query(Int::class.javaObjectType).single()
            ) + 1

        jdbc.sql(
            """
            update content_value set status = 'PUBLISHED', version = :v, published_at = now(), updated_at = now()
            where namespace = :ns and status = 'DRAFT'
            """.trimIndent(),
        ).param("v", next).param("ns", namespace).update()

        val after = publishedNow(namespace)
        audit.record(
            "admin", adminId, "PUBLISH", ENTITY, namespace,
            before = PublishSnapshot(before.maxOfOrNull { it.version } ?: 0, before.map { StoredValue(it.path, it.value) }),
            after = PublishSnapshot(next, after.map { StoredValue(it.path, it.value) }),
        )
        outbox.record(ContentTopics.PUBLISHED, namespace, ContentPublished(namespace, next))
        return PublishView(namespace, next, after, revalidated = revalidator.enabled, publishedCount = drafts.size)
    }

    @Transactional
    fun discardDraft(namespace: String): Int =
        jdbc.sql("delete from content_value where namespace = :ns and status = 'DRAFT'").param("ns", namespace).update()

    /**
     * The storefront read: the latest published value of each path, minus private
     * ones. Latest is chosen first and private filtered second, so a value that
     * became private stops being served instead of falling back to its older
     * public version.
     */
    @Transactional(readOnly = true)
    fun publicValues(namespace: String): PublicContentView {
        val live = publishedNow(namespace).filterNot { it.isPrivate }
        return PublicContentView(namespace, live.maxOfOrNull { it.version } ?: 0, live.map { StoredValue(it.path, it.value) })
    }

    @Transactional(readOnly = true)
    fun history(namespace: String, limit: Int): List<PublishHistoryEntry> =
        jdbc.sql(
            """
            select actor_id, before::text as before, after::text as after, created_at from audit_log
            where entity = :entity and entity_id = :ns and action = 'PUBLISH'
            order by created_at desc limit :limit
            """.trimIndent(),
        )
            .param("entity", ENTITY).param("ns", namespace).param("limit", limit.coerceIn(1, 100))
            .query { rs, _ ->
                PublishHistoryEntry(
                    publishedAt = rs.getTimestamp("created_at").toInstant(),
                    publishedById = rs.getObject("actor_id", UUID::class.java),
                    before = rs.getString("before")?.let { json.readValue(it, PublishSnapshot::class.java) },
                    after = rs.getString("after")?.let { json.readValue(it, PublishSnapshot::class.java) },
                )
            }.list()

    // ---------------------------------------------------------------- helpers

    private fun publishedNow(namespace: String): List<ContentEntryView> =
        ContentRules.latestPerPath(rows(namespace, "PUBLISHED").map { it.view }, { it.path }, { it.version })

    private data class Row(val status: String, val view: ContentEntryView)

    private fun rows(namespace: String, status: String?): List<Row> =
        jdbc.sql(
            """
            select path, value::text as value, status, version, is_private, updated_by, updated_at, published_at
            from content_value where namespace = :ns ${if (status != null) "and status = :status" else ""}
            order by path, version
            """.trimIndent(),
        )
            .param("ns", namespace)
            .apply { if (status != null) param("status", status) }
            .query { rs, _ -> Row(rs.getString("status"), view(rs)) }
            .list()

    private fun view(rs: ResultSet) = ContentEntryView(
        path = rs.getString("path"),
        value = json.readTree(rs.getString("value")),
        version = rs.getInt("version"),
        isPrivate = rs.getBoolean("is_private"),
        updatedById = rs.getObject("updated_by", UUID::class.java),
        updatedAt = rs.getTimestamp("updated_at").toInstant(),
        publishedAt = rs.getTimestamp("published_at")?.toInstant(),
    )

    companion object {
        const val ENTITY = "content_value"
    }
}
