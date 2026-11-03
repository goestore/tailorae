package com.tailorae.media

import com.tailorae.common.ApiResponse
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.SellerScope
import com.tailorae.common.storage.Bucket
import com.tailorae.common.storage.ObjectStorage
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import com.tailorae.seller.SellerContext
import com.tailorae.seller.SellerPermission
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.io.ByteArrayInputStream
import java.security.MessageDigest
import java.sql.ResultSet
import java.time.Instant
import java.util.HexFormat
import java.util.UUID
import javax.imageio.ImageIO

data class ImageInfo(val contentType: String, val extension: String, val width: Int, val height: Int)

/**
 * Identifies an upload as a real image by its bytes, never by its name or
 * header: the magic number must say JPEG, PNG or WebP, and the image must
 * actually decode (JPEG/PNG through ImageIO; WebP's dimensions from its VP8,
 * VP8L or VP8X chunk). Anything else is refused.
 *
 * The file is stored as uploaded. The legacy API re-encoded everything to WebP
 * with sharp; the JDK has no WebP encoder, and a native one is a deployment
 * dependency we have not taken on yet.
 */
object ImageSniffer {
    fun sniff(bytes: ByteArray): ImageInfo? = when {
        bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte() -> decoded(bytes, "image/jpeg", "jpg")
        bytes.size >= 8 && bytes.copyOfRange(0, 8).contentEquals(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) -> decoded(bytes, "image/png", "png")
        bytes.size >= 30 && String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" && String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP" -> webp(bytes)
        else -> null
    }

    private fun decoded(bytes: ByteArray, type: String, ext: String): ImageInfo? {
        val image = runCatching { ImageIO.read(ByteArrayInputStream(bytes)) }.getOrNull() ?: return null
        if (image.width <= 0 || image.height <= 0) return null
        return ImageInfo(type, ext, image.width, image.height)
    }

    private fun u16(b: ByteArray, i: Int) = (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8)
    private fun u24(b: ByteArray, i: Int) = u16(b, i) or ((b[i + 2].toInt() and 0xFF) shl 16)

    private fun webp(b: ByteArray): ImageInfo? {
        val chunk = String(b, 12, 4, Charsets.US_ASCII)
        val (w, h) = when (chunk) {
            // Lossy: frame tag (3 bytes), start code 9D 01 2A, then 14-bit width and height.
            "VP8 " -> {
                if (b[23] != 0x9D.toByte() || b[24] != 0x01.toByte() || b[25] != 0x2A.toByte()) return null
                (u16(b, 26) and 0x3FFF) to (u16(b, 28) and 0x3FFF)
            }
            // Lossless: signature 0x2F, then 14-bit width-1 and height-1.
            "VP8L" -> {
                if (b[20] != 0x2F.toByte()) return null
                val bits = (b[21].toInt() and 0xFF) or ((b[22].toInt() and 0xFF) shl 8) or ((b[23].toInt() and 0xFF) shl 16) or ((b[24].toInt() and 0xFF) shl 24)
                ((bits and 0x3FFF) + 1) to (((bits ushr 14) and 0x3FFF) + 1)
            }
            // Extended: 24-bit canvas width-1 and height-1.
            "VP8X" -> (u24(b, 24) + 1) to (u24(b, 27) + 1)
            else -> return null
        }
        return if (w > 0 && h > 0) ImageInfo("image/webp", "webp", w, h) else null
    }
}

data class MediaAssetView(
    val id: UUID,
    val url: String,
    val filename: String,
    val alt: String,
    val contentType: String,
    val width: Int,
    val height: Int,
    val bytes: Long,
    val createdAt: Instant,
)

/**
 * Storefront images in the PUBLIC bucket. Staff uploads are the shared
 * library; a seller's uploads are its own (row-level security). The same bytes
 * from the same owner reuse one asset.
 */
@Service
class MediaService(
    private val jdbc: JdbcClient,
    private val storage: ObjectStorage,
    private val scope: SellerScope,
    private val audit: Audit,
) {
    @Transactional
    fun upload(sellerId: UUID?, uploadedBy: UUID, filename: String?, content: ByteArray, alt: String?): Pair<MediaAssetView, Boolean> {
        sellerId?.let { scope.enter(it) }
        if (content.isEmpty()) throw BadRequestException("No file was uploaded.")
        if (content.size > MAX_BYTES) throw BadRequestException("Images must be 8 MB or smaller")
        val info = ImageSniffer.sniff(content) ?: throw BadRequestException("That file is not an image we can read. Upload a JPG, PNG or WebP.")
        val hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content)).take(32)
        find(sellerId, hash)?.let { return it to false }

        val stored = storage.put(Bucket.PUBLIC, if (sellerId == null) "media" else "media/$sellerId", "$hash.${info.extension}", info.contentType, content)
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into media_asset (id, seller_id, hash, storage_key, url, filename, alt, content_type, width, height, bytes, uploaded_by)
            values (:id, :s, :hash, :key, :url, :name, :alt, :type, :w, :h, :bytes, :by)
            """.trimIndent(),
        )
            .param("id", id).param("s", sellerId).param("hash", hash).param("key", stored.key).param("url", storage.publicUrl(stored.key))
            .param("name", (filename ?: "upload").substringAfterLast('/').substringAfterLast('\\').take(120))
            .param("alt", alt?.take(300) ?: "").param("type", info.contentType).param("w", info.width).param("h", info.height)
            .param("bytes", stored.bytes).param("by", uploadedBy)
            .update()
        return asset(id) to true
    }

    @Transactional(readOnly = true)
    fun library(limit: Int): List<MediaAssetView> =
        jdbc.sql("select * from media_asset where seller_id is null order by created_at desc limit :l")
            .param("l", limit.coerceIn(1, 200)).query { rs, _ -> view(rs) }.list()

    @Transactional
    fun updateAlt(adminId: UUID, id: UUID, alt: String?): MediaAssetView {
        val n = jdbc.sql("update media_asset set alt = :alt where id = :id and seller_id is null").param("alt", alt?.take(300) ?: "").param("id", id).update()
        if (n == 0) throw NotFoundException("That image no longer exists.")
        audit.record("admin", adminId, "UPDATE", "media_asset", id.toString(), after = mapOf("alt" to alt))
        return asset(id)
    }

    /** The row goes first: a file left behind is wasted disk, a row pointing at nothing is a broken image. */
    @Transactional
    fun delete(adminId: UUID, id: UUID) {
        val key = jdbc.sql("select storage_key from media_asset where id = :id and seller_id is null").param("id", id)
            .query(String::class.java).optional().orElseThrow { NotFoundException("That image no longer exists.") }
        jdbc.sql("delete from media_asset where id = :id").param("id", id).update()
        storage.delete(Bucket.PUBLIC, key)
        audit.record("admin", adminId, "DELETE", "media_asset", id.toString())
    }

    private fun find(sellerId: UUID?, hash: String): MediaAssetView? =
        jdbc.sql("select * from media_asset where seller_id is not distinct from :s and hash = :h").param("s", sellerId).param("h", hash)
            .query { rs, _ -> view(rs) }.optional().orElse(null)

    private fun asset(id: UUID): MediaAssetView =
        jdbc.sql("select * from media_asset where id = :id").param("id", id).query { rs, _ -> view(rs) }.single()

    private fun view(rs: ResultSet) = MediaAssetView(
        rs.getObject("id", UUID::class.java), rs.getString("url"), rs.getString("filename"), rs.getString("alt"),
        rs.getString("content_type"), rs.getInt("width"), rs.getInt("height"), rs.getLong("bytes"), rs.getTimestamp("created_at").toInstant(),
    )

    companion object {
        const val MAX_BYTES = 8 * 1024 * 1024
    }
}

data class AltRequest(val alt: String? = null)

/** The staff image library. */
@RestController
@RequestMapping("/api/admin/media")
class AdminMediaController(private val media: MediaService, private val access: AdminAccess) {
    @GetMapping
    fun list(@AuthenticationPrincipal jwt: Jwt, @RequestParam(defaultValue = "60") limit: Int): ApiResponse<Map<String, Any>> {
        access.require(jwt, AdminPermission.CONTENT, AdminPermission.MODERATOR)
        return ApiResponse.ok(mapOf("assets" to media.library(limit)), "Media fetched")
    }

    @PostMapping(consumes = ["multipart/form-data"])
    fun upload(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestPart("file") file: MultipartFile,
        @RequestParam(required = false) alt: String?,
    ): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val admin = access.require(jwt, AdminPermission.CONTENT, AdminPermission.MODERATOR)
        val (asset, created) = media.upload(null, admin, file.originalFilename, file.bytes, alt)
        return ResponseEntity.status(if (created) HttpStatus.CREATED else HttpStatus.OK).body(ApiResponse.ok(mapOf("asset" to asset), "Image uploaded"))
    }

    @PatchMapping("/{id}")
    fun alt(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: AltRequest): ApiResponse<Map<String, Any>> {
        val admin = access.require(jwt, AdminPermission.CONTENT, AdminPermission.MODERATOR)
        return ApiResponse.ok(mapOf("asset" to media.updateAlt(admin, id, body.alt)), "Media updated")
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, Any>> {
        val admin = access.require(jwt, AdminPermission.CONTENT, AdminPermission.MODERATOR)
        media.delete(admin, id)
        return ApiResponse.ok(mapOf("id" to id), "Image deleted")
    }
}

/** A seller's product photos. */
@RestController
@RequestMapping("/api/seller/media")
class SellerMediaController(private val media: MediaService, private val context: SellerContext) {
    @PostMapping(consumes = ["multipart/form-data"])
    fun upload(
        @AuthenticationPrincipal jwt: Jwt,
        request: HttpServletRequest,
        @RequestPart("file") file: MultipartFile,
    ): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val seller = context.require(jwt, request, SellerPermission.CATALOG)
        val (asset, created) = media.upload(seller.sellerId, seller.accountId, file.originalFilename, file.bytes, null)
        return ResponseEntity.status(if (created) HttpStatus.CREATED else HttpStatus.OK)
            .body(ApiResponse.ok(mapOf("asset" to mapOf("id" to asset.id, "url" to asset.url, "width" to asset.width, "height" to asset.height)), "Photo uploaded"))
    }
}
