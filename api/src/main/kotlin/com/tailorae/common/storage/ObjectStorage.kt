package com.tailorae.common.storage

import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.PublicEndpoint
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.UnauthorizedException
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.CacheControl
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.http.MediaTypeFactory
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.HandlerMapping
import jakarta.servlet.http.HttpServletRequest
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Two buckets: PUBLIC (product photos, banners, logos — served to anyone,
 * cached hard) and PRIVATE (KYC documents, brand authorisations — only ever
 * reached through a short-lived signed URL).
 */
enum class Bucket(val dir: String) { PUBLIC("public"), PRIVATE("private") }

data class StoredObject(val bucket: Bucket, val key: String, val contentType: String, val bytes: Long)

/**
 * Where files live. The local-disk implementation below is what dev and tests
 * use; an S3-compatible implementation (SeaweedFS / RustFS / a cloud bucket)
 * slots in behind the same interface when the storage choice is made.
 */
interface ObjectStorage {
    fun put(bucket: Bucket, prefix: String, filename: String, contentType: String, content: ByteArray): StoredObject
    fun read(bucket: Bucket, key: String): ByteArray?
    fun delete(bucket: Bucket, key: String)

    /** Permanent URL for a PUBLIC object. */
    fun publicUrl(key: String): String

    /** A URL that opens a PRIVATE object for [ttl], then stops working. */
    fun signedUrl(key: String, ttl: Duration = Duration.ofMinutes(5)): String
}

@ConfigurationProperties("tailorae.storage")
data class StorageProperties(
    /** `local` (disk, served by this API) or `s3` (any S3-compatible service; see S3Storage). */
    val type: String = "local",
    val root: String = "./data/storage",
    /** Absolute origin the API is reached at, so stored URLs work from the web app. */
    val publicBaseUrl: String = "http://localhost:8081",
    /** Signs private-file URLs. Any long random string; rotating it invalidates outstanding links. */
    val signingKey: String = "dev-only-signing-key-change-me",
)

@Component
@ConditionalOnProperty(name = ["tailorae.storage.type"], havingValue = "local", matchIfMissing = true)
class LocalDiskStorage(private val props: StorageProperties) : ObjectStorage {
    private val root: Path = Path.of(props.root).toAbsolutePath().normalize()
    private val safeName = Regex("[^a-zA-Z0-9._-]")

    override fun put(bucket: Bucket, prefix: String, filename: String, contentType: String, content: ByteArray): StoredObject {
        val cleanPrefix = prefix.split('/').filter { it.isNotBlank() }.joinToString("/") { safeName.replace(it, "-") }
        val name = "${Ids.newId()}-${safeName.replace(filename, "-").takeLast(80)}"
        val key = if (cleanPrefix.isEmpty()) name else "$cleanPrefix/$name"
        val target = resolve(bucket, key)
        Files.createDirectories(target.parent)
        Files.write(target, content)
        return StoredObject(bucket, key, contentType, content.size.toLong())
    }

    override fun read(bucket: Bucket, key: String): ByteArray? =
        resolve(bucket, key).takeIf { Files.isRegularFile(it) }?.let(Files::readAllBytes)

    override fun delete(bucket: Bucket, key: String) {
        Files.deleteIfExists(resolve(bucket, key))
    }

    override fun publicUrl(key: String) = "${props.publicBaseUrl.trimEnd('/')}/media/$key"

    override fun signedUrl(key: String, ttl: Duration): String {
        val expires = Instant.now().plus(ttl).epochSecond
        return "${props.publicBaseUrl.trimEnd('/')}/api/files/$key?expires=$expires&sig=${sign(key, expires)}"
    }

    fun verify(key: String, expires: Long, sig: String): Boolean =
        expires >= Instant.now().epochSecond &&
            MessageDigest.isEqual(sign(key, expires).toByteArray(), sig.toByteArray())

    private fun sign(key: String, expires: Long): String {
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(props.signingKey.toByteArray(), "HmacSHA256")) }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal("$key:$expires".toByteArray()))
    }

    /** Refuses any key that would escape the bucket directory (`..`, absolute paths). */
    private fun resolve(bucket: Bucket, key: String): Path {
        val base = root.resolve(bucket.dir).normalize()
        val target = base.resolve(key).normalize()
        if (!target.startsWith(base) || key.isBlank()) throw NotFoundException("File not found")
        return target
    }
}

/** Serves both buckets: public files directly, private ones only with a valid signature. */
@RestController
@ConditionalOnProperty(name = ["tailorae.storage.type"], havingValue = "local", matchIfMissing = true)
class StoredFileController(private val storage: LocalDiskStorage) {

    @GetMapping("/media/**")
    fun publicFile(request: HttpServletRequest): ResponseEntity<ByteArray> {
        val key = keyAfter(request, "/media/")
        val bytes = storage.read(Bucket.PUBLIC, key) ?: throw NotFoundException("File not found")
        return ResponseEntity.ok()
            .contentType(typeOf(key))
            // Keys embed a fresh id per upload, so a key's content never changes.
            .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable())
            .body(bytes)
    }

    @GetMapping("/api/files/**")
    fun privateFile(request: HttpServletRequest, @RequestParam expires: Long, @RequestParam sig: String): ResponseEntity<ByteArray> {
        val key = keyAfter(request, "/api/files/")
        if (!storage.verify(key, expires, sig)) throw UnauthorizedException("This link has expired")
        val bytes = storage.read(Bucket.PRIVATE, key) ?: throw NotFoundException("File not found")
        return ResponseEntity.ok()
            .contentType(typeOf(key))
            .cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff")
            .body(bytes)
    }

    private fun keyAfter(request: HttpServletRequest, prefix: String): String {
        val path = request.getAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE) as String
        return path.substringAfter(prefix)
    }

    private fun typeOf(key: String): MediaType =
        MediaTypeFactory.getMediaType(key).orElse(MediaType.APPLICATION_OCTET_STREAM)
}

@Configuration
class StorageEndpoints {
    @Bean
    fun storagePublicEndpoints() = PublicEndpoints(
        listOf(PublicEndpoint(HttpMethod.GET, "/media/**"), PublicEndpoint(HttpMethod.GET, "/api/files/**")),
    )
}
