package com.tailorae.content

import com.tailorae.common.BadRequestException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.storage.Bucket
import com.tailorae.common.storage.ObjectStorage
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.sql.ResultSet
import java.time.Instant
import java.util.HexFormat
import java.util.UUID

data class MediaAssetView(
    val id: UUID,
    /** Absolute URL in the PUBLIC bucket; never changes, safe to cache forever. */
    val url: String,
    val filename: String,
    val alt: String,
    val width: Int,
    val height: Int,
    val bytes: Long,
    val contentType: String,
    val createdAt: Instant,
)

/**
 * The admin image library (legacy-api `routes/media.ts`).
 *
 * An upload is identified by its bytes, stored in the PUBLIC bucket, and keyed
 * by the SHA-256 of its content — re-uploading the same picture returns the
 * existing asset instead of storing a second copy.
 */
@Service
class MediaService(private val jdbc: JdbcClient, private val storage: ObjectStorage) {

    @Transactional(readOnly = true)
    fun list(limit: Int): List<MediaAssetView> =
        jdbc.sql("select * from media_asset order by created_at desc limit :l")
            .param("l", limit.coerceIn(1, MAX_LIST))
            .query { rs, _ -> view(rs) }.list()

    @Transactional
    fun upload(adminId: UUID, originalName: String, alt: String?, bytes: ByteArray): MediaAssetView {
        if (bytes.isEmpty()) throw BadRequestException("No file was uploaded.")
        if (bytes.size > MAX_BYTES) throw BadRequestException("Images must be 8 MB or smaller.")
        val image = ImageProbe.probe(bytes) ?: throw BadRequestException("That file is not an image we can read.")
        val hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))

        find(hash)?.let { return it }
        val stored = storage.put(Bucket.PUBLIC, "media", "${hash.take(32)}.${image.extension}", image.contentType, bytes)
        val inserted = jdbc.sql(
            """
            insert into media_asset (id, hash, storage_key, url, filename, alt, content_type, width, height, bytes, uploaded_by)
            values (:id, :hash, :key, :url, :name, :alt, :type, :w, :h, :bytes, :by)
            on conflict (hash) do nothing
            """.trimIndent(),
        )
            .param("id", Ids.newId()).param("hash", hash).param("key", stored.key)
            .param("url", storage.publicUrl(stored.key))
            // The original name is a label only; it never touches the stored path.
            .param("name", originalName.substringAfterLast('/').substringAfterLast('\\').take(120).ifBlank { "upload" })
            .param("alt", alt?.take(MAX_ALT) ?: "")
            .param("type", image.contentType).param("w", image.width).param("h", image.height)
            .param("bytes", bytes.size.toLong()).param("by", adminId)
            .update()
        // Lost a race with an identical upload: keep theirs, drop our copy.
        if (inserted == 0) storage.delete(Bucket.PUBLIC, stored.key)
        return find(hash)!!
    }

    @Transactional
    fun updateAlt(id: UUID, alt: String?): MediaAssetView {
        val n = jdbc.sql("update media_asset set alt = :alt where id = :id").param("alt", alt?.take(MAX_ALT) ?: "").param("id", id).update()
        if (n == 0) throw NotFoundException("That image no longer exists.")
        return get(id)
    }

    @Transactional
    fun delete(id: UUID) {
        val key = jdbc.sql("select storage_key from media_asset where id = :id").param("id", id)
            .query(String::class.java).optional().orElseThrow { NotFoundException("That image no longer exists.") }
        // The row goes first: a stray file is wasted disk, a row pointing at a deleted file is a broken image.
        jdbc.sql("delete from media_asset where id = :id").param("id", id).update()
        storage.delete(Bucket.PUBLIC, key)
    }

    private fun get(id: UUID): MediaAssetView =
        jdbc.sql("select * from media_asset where id = :id").param("id", id).query { rs, _ -> view(rs) }
            .optional().orElseThrow { NotFoundException("That image no longer exists.") }

    private fun find(hash: String): MediaAssetView? =
        jdbc.sql("select * from media_asset where hash = :h").param("h", hash).query { rs, _ -> view(rs) }.optional().orElse(null)

    private fun view(rs: ResultSet) = MediaAssetView(
        id = rs.getObject("id", UUID::class.java),
        url = rs.getString("url"),
        filename = rs.getString("filename"),
        alt = rs.getString("alt"),
        width = rs.getInt("width"),
        height = rs.getInt("height"),
        bytes = rs.getLong("bytes"),
        contentType = rs.getString("content_type"),
        createdAt = rs.getTimestamp("created_at").toInstant(),
    )

    companion object {
        const val MAX_BYTES = 8 * 1024 * 1024
        const val MAX_ALT = 300
        const val MAX_LIST = 200
    }
}
