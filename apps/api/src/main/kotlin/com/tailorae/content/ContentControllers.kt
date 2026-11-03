package com.tailorae.content

import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.TopicSet
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
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
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

object ContentTopics {
    const val PUBLISHED = "content.published"

    /** Owned and published by the catalog module; declared here too so this consumer's topic exists. */
    const val CATALOG_PRODUCT_CHANGED = "catalog.product.changed"

    val ALL = listOf(PUBLISHED, CATALOG_PRODUCT_CHANGED)
}

@Configuration
class ContentModuleConfig {
    @Bean
    fun contentTopics() = TopicSet(ContentTopics.ALL)

    @Bean
    fun contentPublicEndpoints() = PublicEndpoints.get("/api/content/*", "/api/banners")
}

/** Published values for the storefront. Never drafts, never private values. */
@RestController
@RequestMapping("/api/content")
class PublicContentController(private val content: ContentService) {
    @GetMapping("/{namespace}")
    fun get(@PathVariable namespace: String) =
        // Nothing published yet is not an error: the storefront renders its compiled defaults.
        ApiResponse.ok(content.publicValues(ContentRules.requireNamespace(namespace)), "Content fetched")
}

@RestController
@RequestMapping("/api/admin/content")
class AdminContentController(
    private val content: ContentService,
    private val access: AdminAccess,
    private val json: JsonMapper,
) {
    @GetMapping("/{namespace}")
    fun stages(@AuthenticationPrincipal jwt: Jwt, @PathVariable namespace: String): ApiResponse<ContentStagesView> {
        access.require(jwt, AdminPermission.CONTENT)
        return ApiResponse.ok(content.stages(ContentRules.requireNamespace(namespace)), "Content fetched")
    }

    /** Upserts draft values; the storefront is unaffected until publish. */
    @PutMapping("/{namespace}")
    fun saveDraft(@AuthenticationPrincipal jwt: Jwt, @PathVariable namespace: String, @RequestBody(required = false) body: JsonNode?): ApiResponse<DraftView> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        val ns = ContentRules.requireNamespace(namespace)
        val (entries, errors) = ContentRules.pickValues(body, json)
        if (errors.isNotEmpty()) throw BadRequestException(errors.joinToString(". "))
        return ApiResponse.ok(content.saveDraft(admin, ns, entries), "Draft saved")
    }

    @PostMapping("/{namespace}/publish")
    fun publish(@AuthenticationPrincipal jwt: Jwt, @PathVariable namespace: String): ApiResponse<PublishView> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        val result = content.publish(admin, ContentRules.requireNamespace(namespace))
        return ApiResponse.ok(result, "Published ${result.publishedCount} value(s) as version ${result.version}")
    }

    @DeleteMapping("/{namespace}/draft")
    fun discard(@AuthenticationPrincipal jwt: Jwt, @PathVariable namespace: String): ApiResponse<Map<String, Any>> {
        access.require(jwt, AdminPermission.CONTENT)
        val ns = ContentRules.requireNamespace(namespace)
        val count = content.discardDraft(ns)
        return ApiResponse.ok(mapOf("namespace" to ns, "discarded" to count), "Discarded $count draft value(s)")
    }

    /** Each publish with the values before and after it, newest first. Reverting = PUT `before.values`, then publish. */
    @GetMapping("/{namespace}/history")
    fun history(@AuthenticationPrincipal jwt: Jwt, @PathVariable namespace: String, @RequestParam(defaultValue = "20") limit: Int): ApiResponse<Map<String, Any>> {
        access.require(jwt, AdminPermission.CONTENT)
        val ns = ContentRules.requireNamespace(namespace)
        return ApiResponse.ok(mapOf("namespace" to ns, "publishes" to content.history(ns, limit)), "History fetched")
    }
}


@RestController
class BannerControllers(private val banners: BannerService, private val access: AdminAccess) {

    @GetMapping("/api/banners")
    fun live(@RequestParam(required = false) position: String?) =
        ApiResponse.ok(mapOf("banners" to banners.live(position?.takeIf { it.isNotBlank() })), "Banners fetched")

    @GetMapping("/api/admin/banners")
    fun all(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any>> {
        access.require(jwt, AdminPermission.CONTENT)
        return ApiResponse.ok(mapOf("banners" to banners.all()), "Banners fetched")
    }

    @PostMapping("/api/admin/banners")
    fun create(@AuthenticationPrincipal jwt: Jwt, @RequestBody(required = false) body: JsonNode?): ResponseEntity<ApiResponse<Map<String, BannerView>>> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("banner" to banners.create(admin, body)), "Banner created"))
    }

    @PutMapping("/api/admin/banners/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody(required = false) body: JsonNode?): ApiResponse<Map<String, BannerView>> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        return ApiResponse.ok(mapOf("banner" to banners.update(admin, id, body)), "Banner updated")
    }

    @DeleteMapping("/api/admin/banners/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Unit> {
        val admin = access.require(jwt, AdminPermission.CONTENT)
        banners.delete(admin, id)
        return ApiResponse(true, "Banner deleted")
    }
}
