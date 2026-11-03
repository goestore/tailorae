package com.tailorae.support

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import kotlin.test.assertEquals

/**
 * A browser stand-in for integration tests: keeps its own cookies (so realm
 * cookies and path-scoped refresh cookies behave as in a browser) and speaks
 * the API's JSON envelope.
 */
class TestClient(private val port: Int, private val json: JsonMapper) {
    val cookies = CookieManager(null, CookiePolicy.ACCEPT_ALL)
    private val http: HttpClient = HttpClient.newBuilder().cookieHandler(cookies).build()

    /** Extra headers on every request, e.g. `X-Seller-Id`. */
    val headers = mutableMapOf<String, String>()

    fun get(path: String) = send(request(path).GET())

    fun delete(path: String) = send(request(path).DELETE())

    fun post(path: String, body: Any? = null) = send(request(path).json().POST(publisher(body)))

    fun put(path: String, body: Any? = null) = send(request(path).json().PUT(publisher(body)))

    fun patch(path: String, body: Any? = null) = send(request(path).json().method("PATCH", publisher(body)))

    /** multipart/form-data with plain fields and one file part. */
    fun upload(path: String, fields: Map<String, String>, fileField: String, filename: String, content: ByteArray, contentType: String): Res {
        val boundary = "----tailorae-" + UUID.randomUUID()
        val out = java.io.ByteArrayOutputStream()
        fun line(s: String) = out.write("$s\r\n".toByteArray())
        fields.forEach { (k, v) ->
            line("--$boundary"); line("Content-Disposition: form-data; name=\"$k\""); line(""); line(v)
        }
        line("--$boundary")
        line("Content-Disposition: form-data; name=\"$fileField\"; filename=\"$filename\"")
        line("Content-Type: $contentType")
        line("")
        out.write(content)
        line("")
        line("--$boundary--")
        return send(
            request(path).header("Content-Type", "multipart/form-data; boundary=$boundary")
                .POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())),
        )
    }

    /** Fetches an absolute URL (e.g. a signed file link) without the API base. */
    fun getAbsolute(url: String): HttpResponse<ByteArray> =
        http.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray())

    private fun request(path: String): HttpRequest.Builder =
        HttpRequest.newBuilder(URI.create("http://localhost:$port$path")).apply { headers.forEach { (k, v) -> header(k, v) } }

    private fun HttpRequest.Builder.json() = header("Content-Type", "application/json")

    private fun publisher(body: Any?) = when (body) {
        null -> HttpRequest.BodyPublishers.noBody()
        is String -> HttpRequest.BodyPublishers.ofString(body)
        else -> HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))
    }

    private fun send(builder: HttpRequest.Builder): Res {
        val res = http.send(builder.build(), HttpResponse.BodyHandlers.ofString())
        return Res(res.statusCode(), res.body(), res.headers().map(), json)
    }

    class Res(val status: Int, val body: String, val headers: Map<String, List<String>>, private val json: JsonMapper) {
        val tree: JsonNode by lazy { json.readTree(body) }

        /** The envelope's `data`. */
        val data: JsonNode get() = tree.get("data")

        val message: String get() = tree.get("message")?.asString() ?: ""

        fun expect(status: Int): Res {
            assertEquals(status, this.status, "Unexpected status. Body: $body")
            return this
        }

        fun header(name: String): String? = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.firstOrNull()
    }
}
