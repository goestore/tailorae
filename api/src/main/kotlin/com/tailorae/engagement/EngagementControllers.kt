package com.tailorae.engagement

import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.NotFoundException
import com.tailorae.common.PublicEndpoint
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.TopicSet
import com.tailorae.common.accountId
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.time.LocalDate
import java.util.UUID

@Configuration
class EngagementModuleConfig {
    @Bean
    fun engagementTopics() = TopicSet(EngagementTopics.ALL)

    @Bean
    fun engagementPublicEndpoints() = PublicEndpoints(
        listOf("/api/contact", "/api/newsletter", "/api/newsletter/unsubscribe", "/api/stock-notify")
            .map { PublicEndpoint(HttpMethod.POST, it) },
    )
}

/** Storefront forms: anyone may send them. */
@RestController
class EngagementController(
    private val contact: ContactService,
    private val newsletter: NewsletterService,
    private val stock: StockNotifyService,
) {
    @PostMapping("/api/contact")
    fun contact(@AuthenticationPrincipal jwt: Jwt?, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, ContactRequestView>>> =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("request" to contact.create(body, jwt?.accountId())), "Message received."))

    @PostMapping("/api/newsletter")
    fun subscribe(@RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Unit>> {
        newsletter.subscribe(body?.get("email")?.takeIf { it.isString }?.asString(), body?.get("source")?.takeIf { it.isString }?.asString())
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse(true, "You're on the list."))
    }

    /** Body `{ token }` — the token from the unsubscribe link in a newsletter. */
    @PostMapping("/api/newsletter/unsubscribe")
    fun unsubscribe(@RequestBody(required = false) body: JsonNode?): ApiResponse<Unit> {
        if (!newsletter.unsubscribe(body?.get("token")?.takeIf { it.isString }?.asString())) throw NotFoundException("This unsubscribe link is not valid.")
        return ApiResponse(true, "You have been unsubscribed.")
    }

    @PostMapping("/api/stock-notify")
    fun stockNotify(@RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Unit>> {
        stock.signUp(body)
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse(true, "We'll email you when this is back in stock."))
    }
}

/** Staff: the contact inbox and back-in-stock demand (SUPPORT), newsletter list (CONTENT or SUPPORT). */
@RestController
class AdminEngagementController(
    private val contact: ContactService,
    private val newsletter: NewsletterService,
    private val stock: StockNotifyService,
    private val access: AdminAccess,
) {
    @GetMapping("/api/admin/contact-requests")
    fun contactRequests(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) status: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "100") limit: Int,
    ): ResponseEntity<ApiResponse<Map<String, Any>>> {
        access.require(jwt, AdminPermission.SUPPORT)
        val (rows, pagination) = contact.list(status, page, limit)
        return listResponse("requests", rows, pagination)
    }

    @PatchMapping("/api/admin/contact-requests/{id}")
    fun updateContact(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, ContactRequestView>> {
        val admin = access.require(jwt, AdminPermission.SUPPORT)
        return ApiResponse.ok(mapOf("request" to contact.update(admin, id, body)), "Contact request updated")
    }

    @GetMapping("/api/admin/newsletter-subscribers")
    fun subscribers(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) subscribed: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "200") limit: Int,
    ): ResponseEntity<ApiResponse<Map<String, Any>>> {
        access.require(jwt, AdminPermission.CONTENT, AdminPermission.SUPPORT)
        val (rows, pagination) = newsletter.list(subscribed?.toBooleanStrictOrNull(), page, limit)
        return listResponse("subscribers", rows, pagination)
    }

    @PatchMapping("/api/admin/newsletter-subscribers/{id}")
    fun updateSubscriber(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, SubscriberView>> {
        val admin = access.require(jwt, AdminPermission.CONTENT, AdminPermission.SUPPORT)
        val subscribed = body?.get("isSubscribed")?.takeIf { it.isBoolean }?.asBoolean() ?: throw BadRequestException("isSubscribed must be a boolean")
        return ApiResponse.ok(mapOf("subscriber" to newsletter.setSubscribed(admin, id, subscribed)), "Subscriber updated")
    }

    /** CSV of subscribed addresses (`?all=true` includes unsubscribed ones, flagged). */
    @GetMapping("/api/admin/newsletter-subscribers/export")
    fun export(@AuthenticationPrincipal jwt: Jwt, @RequestParam(defaultValue = "false") all: Boolean): ResponseEntity<String> {
        access.require(jwt, AdminPermission.CONTENT)
        return ResponseEntity.ok()
            .contentType(MediaType("text", "csv", Charsets.UTF_8))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"newsletter-subscribers-${LocalDate.now()}.csv\"")
            .body(newsletter.exportCsv(all))
    }

    @GetMapping("/api/admin/stock-notifications")
    fun stockRequests(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "200") limit: Int,
    ): ResponseEntity<ApiResponse<Map<String, Any>>> {
        access.require(jwt, AdminPermission.SUPPORT)
        val (rows, pagination) = stock.list(page, limit)
        return listResponse("notifications", rows, pagination)
    }

    @PatchMapping("/api/admin/stock-notifications/{id}")
    fun updateStockRequest(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, StockNotificationView>> {
        val admin = access.require(jwt, AdminPermission.SUPPORT)
        val notified = body?.get("notified")?.takeIf { it.isBoolean }?.asBoolean() ?: throw BadRequestException("notified must be a boolean")
        return ApiResponse.ok(mapOf("notification" to stock.setNotified(admin, id, notified)), "Request updated")
    }

    /** The legacy list shape the admin tables read (`data[collection]`), plus paging and `X-Total-Count`. */
    private fun listResponse(collection: String, rows: List<Any>, pagination: ListPagination) =
        ResponseEntity.ok().header("X-Total-Count", pagination.total.toString())
            .body(ApiResponse.ok(mapOf(collection to rows, "pagination" to pagination)))
}
