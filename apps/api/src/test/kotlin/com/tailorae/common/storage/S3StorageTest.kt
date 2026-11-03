package com.tailorae.common.storage

import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.images.builder.Transferable
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The production storage path, against a real S3-compatible server (SeaweedFS). */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class S3StorageTest {
    private val identities = """{"identities":[{"name":"tailorae","credentials":[{"accessKey":"$KEY","secretKey":"$SECRET"}],"actions":["Admin","Read","Write","List","Tagging"]}]}"""

    private val seaweed = GenericContainer("chrislusf/seaweedfs:3.80")
        .withCopyToContainer(Transferable.of(identities), "/etc/seaweedfs/s3.json")
        .withCommand("server", "-s3", "-s3.config=/etc/seaweedfs/s3.json", "-dir=/data")
        .withExposedPorts(8333)
        .waitingFor(Wait.forListeningPorts(8333))
        .withStartupTimeout(Duration.ofMinutes(2))

    private lateinit var storage: S3Storage
    private lateinit var endpoint: String

    @BeforeAll
    fun start() {
        seaweed.start()
        endpoint = "http://${seaweed.host}:${seaweed.getMappedPort(8333)}"
        val props = S3Properties(endpoint = endpoint, region = "us-east-1", accessKey = KEY, secretKey = SECRET)
        S3Client.builder().region(Region.US_EAST_1).endpointOverride(URI.create(endpoint))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(KEY, SECRET)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
            .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED).build().use { admin ->
                listOf(props.publicBucket, props.privateBucket).forEach { admin.createBucket(CreateBucketRequest.builder().bucket(it).build()) }
            }
        storage = S3Storage(props)
    }

    companion object {
        private const val KEY = "tailorae"
        private const val SECRET = "tailorae-test-secret"
    }

    @AfterAll
    fun stop() = seaweed.stop()

    @Test
    fun `stores, reads back, signs private links and deletes`() {
        val bytes = "%PDF-1.4 kyc".toByteArray()
        val stored = storage.put(Bucket.PRIVATE, "kyc/seller-1", "pan card.pdf", "application/pdf", bytes)
        assertTrue(stored.key.startsWith("kyc/seller-1/") && stored.key.endsWith("pan-card.pdf"))
        assertContentEquals(bytes, storage.read(Bucket.PRIVATE, stored.key))

        val link = storage.signedUrl(stored.key, Duration.ofMinutes(5))
        assertTrue(link.contains("X-Amz-Signature"))
        val res = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(link)).GET().build(), HttpResponse.BodyHandlers.ofByteArray())
        assertEquals(200, res.statusCode())
        assertContentEquals(bytes, res.body())

        storage.delete(Bucket.PRIVATE, stored.key)
        assertNull(storage.read(Bucket.PRIVATE, stored.key))
    }

    @Test
    fun `public objects get a stable public URL`() {
        val stored = storage.put(Bucket.PUBLIC, "products", "shirt.webp", "image/webp", byteArrayOf(1, 2, 3))
        assertEquals("$endpoint/tailorae-public/${stored.key}", storage.publicUrl(stored.key))
    }
}
