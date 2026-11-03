package com.tailorae.customwear

import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.PublicEndpoint
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.TopicSet
import com.tailorae.common.UnauthorizedException
import com.tailorae.common.accountId
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import jakarta.validation.Valid
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import tools.jackson.databind.JsonNode
import java.util.UUID

object CustomWearTopics {
    /** Consumed by notification (customer acknowledgement + staff alert). */
    const val QUOTE_REQUESTED = "custom-wear.quote.requested"

    val ALL = listOf(QUOTE_REQUESTED)
}

@Configuration
class CustomWearModuleConfig {
    @Bean
    fun customWearTopics() = TopicSet(CustomWearTopics.ALL)

    /** The catalogue and the quote form are public; a signed-in customer's quote is linked to their account. */
    @Bean
    fun customWearPublicEndpoints() = PublicEndpoints(
        listOf(
            PublicEndpoint(HttpMethod.GET, "/api/custom-wear/products"),
            PublicEndpoint(HttpMethod.GET, "/api/custom-wear/products/**"),
            PublicEndpoint(HttpMethod.GET, "/api/custom-wear/quotes/*"),
            PublicEndpoint(HttpMethod.POST, "/api/custom-wear/quotes"),
            PublicEndpoint(HttpMethod.POST, "/api/custom-wear/quotes/batch"),
            PublicEndpoint(HttpMethod.POST, "/api/custom-wear/artwork"),
        ),
    )
}

/** The 422 body legacy clients read: the envelope plus every validation problem. */
data class QuoteErrorResponse(val success: Boolean, val message: String, val data: Any?, val errors: List<String>)

@RestController
@RequestMapping("/api/custom-wear")
class CustomWearController(
    private val products: CustomWearProductService,
    private val quotes: CustomWearQuoteService,
    private val artwork: ArtworkStore,
) {
    @ExceptionHandler(QuoteValidationException::class)
    fun invalid(e: QuoteValidationException) =
        ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(QuoteErrorResponse(false, e.message ?: "", null, e.errors))

    // ---------------------------------------------------------------- catalogue

    /** Query keys as `web/src/lib/custom-wear/url-state.ts` writes them; lists are comma-separated. */
    @GetMapping("/products")
    fun list(
        @RequestParam(required = false) category: String?,
        @RequestParam(required = false) gender: String?,
        @RequestParam(required = false) type: String?,
        @RequestParam(required = false) color: String?,
        @RequestParam(required = false) size: String?,
        @RequestParam(required = false) fabric: String?,
        @RequestParam(required = false) gsm: String?,
        @RequestParam(required = false) method: String?,
        @RequestParam(required = false) location: String?,
        @RequestParam(required = false) moq: String?,
        @RequestParam(required = false) minPricePaise: Long?,
        @RequestParam(required = false) maxPricePaise: Long?,
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) sort: String?,
        @RequestParam(required = false) ids: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "24") pageSize: Int,
    ): ResponseEntity<ApiResponse<ProductQueryResult>> {
        val filters = CustomWearFilters(
            category = category?.takeIf { it.isNotBlank() },
            gender = csv(gender), productType = csv(type), color = csv(color), size = csv(size),
            fabric = csv(fabric), gsm = csv(gsm), method = csv(method), location = csv(location), moq = csv(moq),
            minPricePaise = minPricePaise, maxPricePaise = maxPricePaise,
            search = q ?: "",
            sort = sort?.takeIf { it in CustomWearTaxonomy.SORTS } ?: "recommended",
            page = page,
            ids = csv(ids).mapNotNull { runCatching { UUID.fromString(it) }.getOrNull() },
        )
        val result = products.query(filters, pageSize)
        return ResponseEntity.ok().header("X-Total-Count", result.total.toString()).body(ApiResponse.ok(result, "Products fetched"))
    }

    /** Every active slug, for static params and the sitemap. */
    @GetMapping("/products/slugs")
    fun slugs() = ApiResponse.ok(mapOf("slugs" to products.slugs()))

    @GetMapping("/products/{slug}")
    fun product(@PathVariable slug: String) = ApiResponse.ok(mapOf("product" to products.bySlug(slug)))

    @GetMapping("/products/{key}/related")
    fun related(@PathVariable key: String, @RequestParam(defaultValue = "6") limit: Int) =
        ApiResponse.ok(mapOf("products" to products.related(key, limit)))

    // ---------------------------------------------------------------- quotes

    @PostMapping("/quotes")
    fun quote(@AuthenticationPrincipal jwt: Jwt?, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val input = body?.takeIf { it.isObject } ?: throw QuoteValidationException(listOf("Send the request as a JSON object"))
        val errors = mutableListOf<String>()
        val contact = QuoteRules.parseContact(input, errors)
        val item = QuoteRules.parseItem(input, errors)
        if (errors.isNotEmpty()) throw QuoteValidationException(errors)
        val created = quotes.create(contact, listOf(item), jwt?.accountId(), prefixErrors = false)
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok(
                mapOf(
                    "reference" to created.reference, "references" to created.references, "persisted" to true,
                    "receivedAt" to created.receivedAt, "quote" to created.quotes.first(),
                ),
                "Quote request received",
            ),
        )
    }

    /** The cart's custom-wear section: one contact, one quote per line, all or none. */
    @PostMapping("/quotes/batch")
    fun batch(@AuthenticationPrincipal jwt: Jwt?, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val input = body?.takeIf { it.isObject } ?: throw QuoteValidationException(listOf("Send the request as a JSON object"))
        val errors = mutableListOf<String>()
        val contact = QuoteRules.parseContact(input, errors)
        val raw = input.get("items")
        if (raw == null || !raw.isArray || raw.size() == 0 || raw.size() > QuoteRules.MAX_BATCH) {
            errors += "items must be a list of 1 to ${QuoteRules.MAX_BATCH} garments"
        }
        val items = if (raw != null && raw.isArray) {
            (0 until raw.size()).map { index ->
                val itemErrors = mutableListOf<String>()
                val entry = raw.get(index).takeIf { it.isObject } ?: tools.jackson.databind.node.JsonNodeFactory.instance.objectNode()
                QuoteRules.parseItem(entry, itemErrors).also { errors += itemErrors.map { "items[$index]: $it" } }
            }
        } else emptyList()
        if (errors.isNotEmpty()) throw QuoteValidationException(errors)
        val created = quotes.create(contact, items, jwt?.accountId(), prefixErrors = true)
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok(
                mapOf(
                    "reference" to created.reference, "references" to created.references, "persisted" to true,
                    "receivedAt" to created.receivedAt, "quotes" to created.quotes,
                ),
                "Quote requests received",
            ),
        )
    }

    @GetMapping("/quotes/mine")
    fun mine(@AuthenticationPrincipal jwt: Jwt?): ApiResponse<Map<String, Any>> {
        val customer = jwt?.accountId() ?: throw UnauthorizedException()
        return ApiResponse.ok(mapOf("quotes" to quotes.mine(customer)))
    }

    @GetMapping("/quotes/{reference}")
    fun lookup(@PathVariable reference: String, @RequestParam(required = false) email: String?): ApiResponse<Map<String, Any>> {
        val ref = reference.trim().uppercase()
        val mail = email?.trim()?.lowercase() ?: ""
        if (!QuoteRules.REFERENCE.matches(ref) || !QuoteRules.isValidEmail(mail)) {
            throw BadRequestException("Enter your quote reference and the email you used.")
        }
        return ApiResponse.ok(mapOf("quote" to quotes.lookup(ref, mail)))
    }

    // ---------------------------------------------------------------- artwork

    @PostMapping("/artwork", consumes = ["multipart/form-data"])
    fun upload(@RequestPart(required = false) file: MultipartFile?): ResponseEntity<ApiResponse<Map<String, ArtworkView>>> {
        if (file == null) throw BadRequestException("No file was uploaded.")
        val stored = artwork.store(file.originalFilename ?: "artwork", file.bytes)
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("artwork" to stored), "Artwork uploaded"))
    }

    private fun csv(raw: String?): List<String> = raw?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.distinct() ?: emptyList()
}

/** Staff: the quote desk (SUPPORT) and the catalogue (CONTENT). */
@RestController
@RequestMapping("/api/admin/custom-wear")
class AdminCustomWearController(
    private val quotes: CustomWearQuoteService,
    private val products: CustomWearProductService,
    private val access: AdminAccess,
) {
    @GetMapping("/quotes")
    fun list(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) search: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "25") limit: Int,
    ): ResponseEntity<ApiResponse<AdminQuoteList>> {
        access.require(jwt, AdminPermission.SUPPORT)
        val result = quotes.adminList(status, search, page, limit)
        return ResponseEntity.ok().header("X-Total-Count", result.pagination.total.toString()).body(ApiResponse.ok(result))
    }

    @GetMapping("/quotes/{id}")
    fun get(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: String): ApiResponse<Map<String, AdminQuoteView>> {
        access.require(jwt, AdminPermission.SUPPORT)
        return ApiResponse.ok(mapOf("quote" to quotes.adminGet(id)))
    }

    /** Body: `{ status?, quotedPricePaise?: number|null, adminNotes?: string|null }`. */
    @PatchMapping("/quotes/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, AdminQuoteView>> {
        val admin = access.require(jwt, AdminPermission.SUPPORT)
        val b = body?.takeIf { it.isObject } ?: throw BadRequestException("Nothing to update.")
        var status: String? = null
        b.get("status")?.let {
            if (!it.isString || it.asString() !in QuoteRules.STATUSES) throw BadRequestException("Status must be one of ${QuoteRules.STATUSES.joinToString(", ")}")
            status = it.asString()
        }
        var price: Long? = null
        var clearPrice = false
        b.get("quotedPricePaise")?.let {
            when {
                it.isNull || (it.isString && it.asString().isBlank()) -> clearPrice = true
                it.isIntegralNumber && it.asLong() in 0..MAX_PRICE_PAISE -> price = it.asLong()
                else -> throw BadRequestException("Quoted price must be a whole number of paise, zero or more.")
            }
        }
        var notes: String? = null
        var clearNotes = false
        b.get("adminNotes")?.let {
            if (!it.isNull && !it.isString) throw BadRequestException("Notes must be text.")
            val trimmed = if (it.isString) it.asString().trim().take(5000) else ""
            if (trimmed.isEmpty()) clearNotes = true else notes = trimmed
        }
        if (status == null && price == null && !clearPrice && notes == null && !clearNotes) throw BadRequestException("Nothing to update.")
        val quote = quotes.adminUpdate(admin, id, CustomWearQuoteService.QuotePatch(status, price, clearPrice, notes, clearNotes))
        return ApiResponse(true, "Quote updated", mapOf("quote" to quote))
    }

    @GetMapping("/products")
    fun products(@AuthenticationPrincipal jwt: Jwt, @RequestParam(defaultValue = "true") includeInactive: Boolean): ApiResponse<Map<String, Any>> {
        access.require(jwt, AdminPermission.CONTENT)
        return ApiResponse.ok(mapOf("products" to products.all(includeInactive)))
    }

    @GetMapping("/products/{id}")
    fun product(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, CustomWearProduct>> {
        access.require(jwt, AdminPermission.CONTENT)
        return ApiResponse.ok(mapOf("product" to products.get(id)))
    }

    @PostMapping("/products")
    fun create(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: CustomWearProductRequest): ResponseEntity<ApiResponse<Map<String, CustomWearProduct>>> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("product" to products.create(admin, body)), "Product created"))
    }

    @PutMapping("/products/{id}")
    fun replace(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @Valid @RequestBody body: CustomWearProductRequest): ApiResponse<Map<String, CustomWearProduct>> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        return ApiResponse.ok(mapOf("product" to products.update(admin, id, body)), "Product saved")
    }

    @DeleteMapping("/products/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Unit> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        products.delete(admin, id)
        return ApiResponse(true, "Product deleted")
    }

    companion object {
        const val MAX_PRICE_PAISE = 10_000_000_000L
    }
}
