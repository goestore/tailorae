package com.tailorae.commerce

import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Service
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

@ConfigurationProperties("tailorae.delivery")
data class DeliveryProperties(
    /** India Post lookup; empty switches the lookup off (tests, offline dev). */
    val pincodeLookupUrl: String = "https://api.postalpincode.in/pincode",
    val cacheSize: Int = 5000,
)

data class PincodeInfo(val pincode: String, val serviceable: Boolean, val city: String, val district: String, val state: String)

data class DeliveryEstimate(
    val pincode: String,
    val serviceable: Boolean,
    val city: String = "",
    val state: String = "",
    val cod: Boolean = false,
    val minDays: Int = 0,
    val maxDays: Int = 0,
    val earliest: String = "",
    val latest: String = "",
    val source: String,
)

/**
 * PIN-code checks and delivery estimates — a port of legacy delivery.ts. The
 * estimate is zone-based (first PIN digit) until a courier integration exists.
 */
@Service
class DeliveryService(private val props: DeliveryProperties, private val json: JsonMapper) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private val cache = ConcurrentHashMap<String, Pair<PincodeInfo, Instant>>()
    private val zoneDays = mapOf('1' to 4, '2' to 4, '3' to 3, '4' to 3, '5' to 4, '6' to 4, '7' to 5, '8' to 6)

    fun isPincode(value: String) = Regex("^[1-9][0-9]{5}$").matches(value)

    /** Null only when the lookup itself failed; then the caller treats the PIN as serviceable. */
    fun lookup(pin: String): PincodeInfo? {
        cache[pin]?.let { (info, expires) -> if (Instant.now().isBefore(expires)) return info else cache.remove(pin) }
        if (props.pincodeLookupUrl.isBlank()) return null
        return try {
            val res = http.send(
                HttpRequest.newBuilder(URI.create("${props.pincodeLookupUrl.trimEnd('/')}/$pin")).timeout(Duration.ofSeconds(8)).GET().build(),
                HttpResponse.BodyHandlers.ofString(),
            )
            val entry = json.readTree(res.body()).get(0)
            val office = entry?.get("PostOffice")?.get(0)
            val info = if (entry?.get("Status")?.asString() != "Success" || office == null) {
                PincodeInfo(pin, false, "", "", "")
            } else {
                PincodeInfo(
                    pin, true,
                    office.get("Block")?.asString()?.takeIf { it.isNotBlank() && it != "NA" } ?: office.get("Name")?.asString().orEmpty(),
                    office.get("District")?.asString().orEmpty(), office.get("State")?.asString().orEmpty(),
                )
            }
            if (cache.size >= props.cacheSize) cache.keys.firstOrNull()?.let(cache::remove)
            cache[pin] = info to Instant.now().plus(Duration.ofHours(24))
            info
        } catch (e: Exception) {
            log.warn("India Post lookup failed for {}: {}", pin, e.message)
            null
        }
    }

    fun estimate(pin: String, today: LocalDate = LocalDate.now(IST)): DeliveryEstimate {
        val info = lookup(pin)
        if (info != null && !info.serviceable) return DeliveryEstimate(pin, false, source = "india-post")
        val min = zoneDays[pin[0]] ?: 5
        val max = min + 2
        return DeliveryEstimate(
            pincode = pin, serviceable = true, city = info?.city.orEmpty(), state = info?.state.orEmpty(),
            // Zone 8 PINs have no cash on delivery (legacy rule, kept until a courier integration says otherwise).
            cod = pin[0] != '8', minDays = min, maxDays = max,
            earliest = today.plusDays(min.toLong()).format(LABEL), latest = today.plusDays(max.toLong()).format(LABEL),
            source = "estimate",
        )
    }

    companion object {
        val IST: ZoneId = ZoneId.of("Asia/Kolkata")
        private val LABEL = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)
    }
}
