package com.tailorae.common.storage

import com.tailorae.common.Ids
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest
import java.net.URI
import java.time.Duration

@ConfigurationProperties("tailorae.storage.s3")
data class S3Properties(
    /** Empty for AWS itself; the service URL for R2, SeaweedFS, RustFS, … */
    val endpoint: String = "",
    val region: String = "ap-south-1",
    val accessKey: String = "",
    val secretKey: String = "",
    val publicBucket: String = "tailorae-public",
    val privateBucket: String = "tailorae-private",
    /**
     * Where public objects are read from — a CDN in front of the public bucket,
     * or the bucket's own public URL. Keys are appended as-is.
     */
    val publicBaseUrl: String = "",
    /** Most self-hosted S3 servers need path-style addressing (`endpoint/bucket/key`). */
    val pathStyle: Boolean = true,
)

/**
 * Production storage on any S3-compatible service. The public bucket is meant
 * to be world-readable (or fronted by a CDN); the private bucket never is —
 * its objects are only reachable through presigned links that expire.
 */
@Component
@ConditionalOnProperty(name = ["tailorae.storage.type"], havingValue = "s3")
class S3Storage(private val props: S3Properties) : ObjectStorage {
    private val safeName = Regex("[^a-zA-Z0-9._-]")
    private val credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create(props.accessKey, props.secretKey))
    private val config = S3Configuration.builder().pathStyleAccessEnabled(props.pathStyle).build()

    private val client: S3Client = S3Client.builder()
        .region(Region.of(props.region))
        .credentialsProvider(credentials)
        .serviceConfiguration(config)
        // The SDK's default chunked-with-trailing-checksum uploads are AWS-only; S3-compatible
        // servers (R2, SeaweedFS, RustFS) would store the chunk framing as part of the file.
        .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
        .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
        .apply { if (props.endpoint.isNotBlank()) endpointOverride(URI.create(props.endpoint)) }
        .build()

    private val presigner: S3Presigner = S3Presigner.builder()
        .region(Region.of(props.region))
        .credentialsProvider(credentials)
        .serviceConfiguration(config)
        .apply { if (props.endpoint.isNotBlank()) endpointOverride(URI.create(props.endpoint)) }
        .build()

    private fun bucket(b: Bucket) = if (b == Bucket.PUBLIC) props.publicBucket else props.privateBucket

    override fun put(bucket: Bucket, prefix: String, filename: String, contentType: String, content: ByteArray): StoredObject {
        val cleanPrefix = prefix.split('/').filter { it.isNotBlank() }.joinToString("/") { safeName.replace(it, "-") }
        val name = "${Ids.newId()}-${safeName.replace(filename, "-").takeLast(80)}"
        val key = if (cleanPrefix.isEmpty()) name else "$cleanPrefix/$name"
        client.putObject(
            PutObjectRequest.builder().bucket(bucket(bucket)).key(key).contentType(contentType)
                // Keys never change content (each upload gets a fresh id), so public objects cache forever.
                .apply { if (bucket == Bucket.PUBLIC) cacheControl("public, max-age=31536000, immutable") }
                .build(),
            RequestBody.fromBytes(content),
        )
        return StoredObject(bucket, key, contentType, content.size.toLong())
    }

    override fun read(bucket: Bucket, key: String): ByteArray? = try {
        client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket(bucket)).key(key).build()).asByteArray()
    } catch (e: NoSuchKeyException) {
        null
    }

    override fun delete(bucket: Bucket, key: String) {
        client.deleteObject(DeleteObjectRequest.builder().bucket(bucket(bucket)).key(key).build())
    }

    override fun publicUrl(key: String): String {
        val base = props.publicBaseUrl.ifBlank { "${props.endpoint.trimEnd('/')}/${props.publicBucket}" }
        return "${base.trimEnd('/')}/$key"
    }

    override fun signedUrl(key: String, ttl: Duration): String =
        presigner.presignGetObject(
            GetObjectPresignRequest.builder()
                .signatureDuration(ttl)
                .getObjectRequest(GetObjectRequest.builder().bucket(props.privateBucket).key(key).build())
                .build(),
        ).url().toString()
}
