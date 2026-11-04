package com.tailorae.catalog

import com.tailorae.catalog.rules.ColourFamilies
import com.tailorae.catalog.rules.ProductSpec
import com.tailorae.common.ApiResponse
import com.tailorae.common.NotFoundException
import com.tailorae.common.PageParams
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import com.tailorae.seller.SellerContext
import com.tailorae.seller.SellerPermission
import jakarta.servlet.http.HttpServletRequest
import org.springframework.core.MethodParameter
import org.springframework.http.CacheControl
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageConverter
import org.springframework.http.server.ServerHttpRequest
import org.springframework.http.server.ServerHttpResponse
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
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice
import java.util.UUID
import java.util.concurrent.TimeUnit

private fun flag(value: String?) = value == "1" || value == "true" || value == "on"

/** `{ products, pagination }` with `X-Total-Count`, the shape every legacy list caller reads. */
private fun productPage(products: List<Map<String, Any?>>, page: Int, limit: Int, total: Long, message: String = "Products fetched") =
    ResponseEntity.ok().header("X-Total-Count", total.toString()).body(
        ApiResponse.ok(
            mapOf("products" to products, "pagination" to mapOf("page" to page, "limit" to limit, "total" to total,
                "totalPages" to if (limit == 0) 0 else ((total + limit - 1) / limit))),
            message,
        ),
    )

private fun rupeesToPaise(value: String?): Long? = value?.trim()?.toBigDecimalOrNull()?.movePointRight(2)?.toLong()

/** Builds the listing query from the public URL contract (legacy spellings included). */
private fun listingQuery(p: Map<String, String>, defaultLimit: Int = 12) = ListingQuery(
    q = p["q"]?.takeIf { it.isNotBlank() } ?: p["search"],
    category = p["category"], brand = p["brand"], vendor = p["vendor"] ?: p["seller"], color = p["color"], size = p["size"],
    ageGroup = p["ageGroup"], audience = p["audience"], match = p["match"], exclude = p["exclude"],
    // Prices in the public URL are rupees, as the storefront has always sent them; the *Paise forms are exact.
    minPricePaise = p["minPricePaise"]?.toLongOrNull() ?: rupeesToPaise(p["minPrice"]),
    maxPricePaise = p["maxPricePaise"]?.toLongOrNull() ?: rupeesToPaise(p["maxPrice"]),
    featured = p["featured"] == "true", sale = flag(p["sale"]) || flag(p["onSale"]), newest = flag(p["newest"]),
    inStock = flag(p["inStock"]), ids = p["ids"], sortBy = p["sortBy"],
    attributes = p.filterKeys { it.startsWith("attr_") }.mapKeys { it.key.removePrefix("attr_") },
    page = p["page"]?.toIntOrNull() ?: 1, limit = p["limit"]?.toIntOrNull() ?: defaultLimit,
)

// ==================================================================== storefront

@RestController
@RequestMapping("/api/products")
class StorefrontController(private val store: StorefrontService, private val categories: CategoryService) {

    @GetMapping
    fun list(@RequestParam params: Map<String, String>): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val result = store.list(listingQuery(params))
        return productPage(result.products, result.page, result.limit, result.total)
    }

    @GetMapping("/categories/list")
    fun categories(@RequestParam(required = false) tree: String?) =
        ApiResponse.ok(mapOf("categories" to if (flag(tree)) categories.publicTree() else categories.withLiveProducts()), "Categories fetched")

    @GetMapping("/categories/home")
    fun homeCategories() = ApiResponse.ok(mapOf("categories" to categories.home()), "Homepage categories fetched")

    @GetMapping("/sellers/list")
    fun sellers() = ApiResponse.ok(mapOf("sellers" to store.sellers()), "Sellers fetched")

    @GetMapping("/sellers/{slug}")
    fun seller(@PathVariable slug: String) = ApiResponse.ok(mapOf("seller" to store.seller(slug)), "Seller fetched")

    @GetMapping("/brands/list")
    fun brands() = ApiResponse.ok(mapOf("brands" to store.brands()), "Brands fetched")

    @GetMapping("/brands/{slug}")
    fun brand(@PathVariable slug: String) = ApiResponse.ok(mapOf("brand" to store.brand(slug)), "Brand fetched")

    @GetMapping("/colors/families")
    fun families() = ApiResponse.ok(mapOf("families" to ColourFamilies.ALL), "Colour families")

    @GetMapping("/colors/suggest")
    fun suggestFamily(@RequestParam(required = false) name: String?, @RequestParam(required = false) hex: String?) =
        ApiResponse.ok(mapOf("family" to ColourFamilies.suggest(name ?: "", hex)?.name), "Suggestion")

    @GetMapping("/colors/list")
    fun colours(@RequestParam params: Map<String, String>) = ApiResponse.ok(store.colours(listingQuery(params)), "Colours fetched")

    @GetMapping("/facets/list")
    fun facets(@RequestParam params: Map<String, String>) = ApiResponse.ok(store.facets(listingQuery(params)), "Facets fetched")

    @GetMapping("/search/q")
    fun search(@RequestParam(required = false) q: String?, @RequestParam(required = false) limit: Int?): ApiResponse<Map<String, Any?>> {
        val result = store.suggest(q, limit)
        return ApiResponse.ok(result, if ((result["items"] as List<*>).isEmpty()) "No results" else if (result["fuzzy"] == true) "Near matches" else "Search results")
    }

    @GetMapping("/{idOrSlug}")
    fun detail(@PathVariable idOrSlug: String) = ApiResponse.ok(mapOf("product" to store.detail(idOrSlug)), "Product fetched")
}

/**
 * Storefront catalogue reads are the same for every visitor, so browsers may
 * reuse one for 30 seconds and show it for a minute more while refetching.
 * Moving between listing pages then stops re-asking for the same filters.
 *
 * Only successful GETs: errors are written by the shared exception handler,
 * which is outside this advice's scope, so a 404 or 500 is never cached.
 */
@RestControllerAdvice(assignableTypes = [StorefrontController::class])
class StorefrontCaching : ResponseBodyAdvice<Any> {
    override fun supports(returnType: MethodParameter, converterType: Class<out HttpMessageConverter<*>>) = true

    override fun beforeBodyWrite(
        body: Any?,
        returnType: MethodParameter,
        selectedContentType: MediaType,
        selectedConverterType: Class<out HttpMessageConverter<*>>,
        request: ServerHttpRequest,
        response: ServerHttpResponse,
    ): Any? {
        if (request.method == HttpMethod.GET && !response.headers.containsHeader(HttpHeaders.CACHE_CONTROL)) {
            response.headers.cacheControl = STOREFRONT_CACHE.headerValue
        }
        return body
    }

    private companion object {
        val STOREFRONT_CACHE: CacheControl = CacheControl.maxAge(30, TimeUnit.SECONDS)
            .staleWhileRevalidate(60, TimeUnit.SECONDS)
    }
}

/** The listing templates, for the product form. Static apart from a category's own fields, so it is public. */
@RestController
@RequestMapping("/api/catalogue")
class CatalogueController(private val categories: CategoryService) {

    @GetMapping("/article-types")
    fun articleTypes(): ResponseEntity<ApiResponse<Map<String, Any>>> =
        ResponseEntity.ok().cacheControl(CacheControl.maxAge(300, TimeUnit.SECONDS))
            .body(ApiResponse.ok(mapOf("articleTypes" to ProductSpec.listArticleTypes())))

    @GetMapping("/article-types/{type}")
    fun articleType(@PathVariable type: String, @RequestParam(required = false) categoryId: String?): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val spec = ProductSpec.articleSpec(type, categoryId?.let { categories.extras(it) }) ?: throw NotFoundException("Unknown article type")
        val cache = if (categoryId != null) CacheControl.noCache() else CacheControl.maxAge(300, TimeUnit.SECONDS)
        return ResponseEntity.ok().cacheControl(cache).body(ApiResponse.ok(mapOf("spec" to spec)))
    }
}

// ==================================================================== seller

@RestController
@RequestMapping("/api/seller")
class SellerCatalogController(
    private val products: ProductService,
    private val brands: BrandService,
    private val context: SellerContext,
) {
    private fun seller(jwt: Jwt, request: HttpServletRequest) = context.require(jwt, request, SellerPermission.CATALOG)

    @GetMapping("/products")
    fun list(
        @AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest,
        @RequestParam(required = false) status: String?, @RequestParam(required = false) q: String?,
        @RequestParam(defaultValue = "1") page: Int, @RequestParam(defaultValue = "50") limit: Int,
    ): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val result = products.sellerList(seller(jwt, request), status, q, PageParams(page, limit))
        return productPage(result.items, result.page, result.limit, result.total)
    }

    @PostMapping("/products")
    fun create(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @RequestBody body: Map<String, Any?>) =
        ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok(mapOf("product" to products.sellerCreate(seller(jwt, request), body)), "Product saved. It will go live once our team has reviewed it."),
        )

    @GetMapping("/products/{id}")
    fun get(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID) =
        ApiResponse.ok(mapOf("product" to products.sellerGet(seller(jwt, request), id)), "Product fetched")

    @PutMapping("/products/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val (product, sentBack) = products.sellerUpdate(seller(jwt, request), id, body)
        return ApiResponse.ok(mapOf("product" to product),
            if (sentBack) "Product updated. The changes will show once our team has reviewed them." else "Product updated")
    }

    @DeleteMapping("/products/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID): ApiResponse<Unit> {
        products.sellerDiscontinue(seller(jwt, request), id)
        return ApiResponse(true, "Product discontinued")
    }

    @PutMapping("/products/{id}/customizations")
    fun customizations(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("customizations" to products.sellerCustomizations(seller(jwt, request), id, body)), "Customisation options saved")

    @GetMapping("/products/{id}/variants")
    fun variants(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID) =
        ApiResponse.ok(mapOf("variants" to products.sellerVariants(seller(jwt, request), id)), "Variants fetched")

    @PostMapping("/products/{id}/variants")
    fun addVariant(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("variant" to products.sellerAddVariant(seller(jwt, request), id, body)), "Size added"))

    @PutMapping("/products/{id}/variants/{variantId}")
    fun updateVariant(
        @AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID, @PathVariable variantId: UUID,
        @RequestBody body: Map<String, Any?>,
    ) = ApiResponse.ok(mapOf("variant" to products.sellerUpdateVariant(seller(jwt, request), id, variantId, body)), "Size updated")

    @DeleteMapping("/products/{id}/variants/{variantId}")
    fun deleteVariant(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID, @PathVariable variantId: UUID): ApiResponse<Unit> {
        products.sellerDeleteVariant(seller(jwt, request), id, variantId)
        return ApiResponse(true, "Size removed")
    }

    // ------------------------------------------------------------ brands

    @GetMapping("/brands")
    fun brands(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(mapOf("brands" to brands.sellerBrands(seller(jwt, request))))

    @PostMapping("/brands", consumes = ["multipart/form-data"])
    fun registerBrand(
        @AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest,
        @RequestParam(required = false) name: String?, @RequestParam(required = false) authorizationType: String?,
        @RequestParam(required = false) description: String?, @RequestParam(required = false) logo: String?,
        @RequestPart("document", required = false) document: MultipartFile?,
    ): ResponseEntity<ApiResponse<Map<String, Any?>>> {
        val type = AuthorizationType.entries.firstOrNull { it.name == authorizationType }
        val (brand, created) = brands.register(seller(jwt, request), name, type, description, logo, document?.originalFilename, document?.bytes)
        return ResponseEntity.status(if (created) HttpStatus.CREATED else HttpStatus.OK).body(
            ApiResponse.ok(mapOf("brand" to brand), "Brand submitted for review. You can list under it once it is approved."),
        )
    }

    /** A five-minute link to the proof on file (the PRIVATE bucket is never served directly). */
    @GetMapping("/brands/{id}/document")
    fun brandDocument(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @PathVariable id: UUID) =
        ApiResponse.ok(mapOf("url" to brands.sellerDocumentUrl(seller(jwt, request), id)))

    @GetMapping("/catalogue/brands")
    fun listingBrands(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(mapOf("brands" to brands.listingFormBrands(seller(jwt, request))))

    @PostMapping("/catalogue/brands")
    fun quickAddBrand(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest, @RequestBody body: Map<String, Any?>): ResponseEntity<ApiResponse<Map<String, Any?>>> {
        val (brand, created) = brands.quickAdd(seller(jwt, request), body["name"] as? String)
        return ResponseEntity.status(if (created) HttpStatus.CREATED else HttpStatus.OK).body(
            ApiResponse.ok(mapOf("brand" to brand, "created" to created), if (created) "Brand added — it can be used once our team approves it" else "That brand already exists"),
        )
    }

    @GetMapping("/catalogue/last-business-details")
    fun lastBusinessDetails(@AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest) =
        ApiResponse.ok(mapOf("details" to products.lastBusinessDetails(seller(jwt, request))))
}

// ==================================================================== staff

@RestController
@RequestMapping("/api/admin/products")
class AdminProductController(
    private val products: ProductService,
    private val queries: AdminProductQueries,
    private val sheets: CatalogSheetService,
    private val access: AdminAccess,
) {
    private fun staff(jwt: Jwt) = access.require(jwt, AdminPermission.MODERATOR)

    @GetMapping
    fun list(@AuthenticationPrincipal jwt: Jwt, @RequestParam params: Map<String, String>): ResponseEntity<ApiResponse<Map<String, Any>>> {
        staff(jwt)
        val (rows, total, paging) = queries.list(params, params["page"]?.toIntOrNull() ?: 1, params["limit"]?.toIntOrNull() ?: 20)
        return productPage(rows, paging.first, paging.second, total)
    }

    @GetMapping("/summary")
    fun summary(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any?>> {
        staff(jwt)
        return ApiResponse.ok(queries.summary())
    }

    @PostMapping("/bulk")
    fun bulk(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val result = products.adminBulk(staff(jwt), body["ids"], body["action"])
        return ApiResponse.ok(mapOf("count" to result["count"], "skipped" to result["skipped"]), result["message"] as String)
    }

    @PostMapping
    fun create(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Any?>) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("product" to products.adminCreate(staff(jwt), body)), "Product created"))

    @GetMapping("/{id}")
    fun get(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, Any?>> {
        staff(jwt)
        return ApiResponse.ok(mapOf("product" to products.adminGet(id)), "Product fetched")
    }

    @PutMapping("/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("product" to products.adminUpdate(staff(jwt), id, body)), "Product updated")

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID) =
        ApiResponse.ok(mapOf("product" to products.adminDiscontinue(staff(jwt), id)), "Product discontinued")

    @PatchMapping("/{id}/featured")
    fun featured(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("product" to products.adminFeatured(staff(jwt), id, body["isFeatured"] as? Boolean)), "Product featured status updated")

    @PutMapping("/{id}/customizations")
    fun customizations(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("customizations" to products.adminCustomizations(staff(jwt), id, body)), "Customisation options saved")

    @PutMapping("/{id}/bulk-pricing")
    fun bulkPricing(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("bulkPricings" to products.adminBulkPricing(staff(jwt), id, body)), "Bulk pricing saved")

    @PostMapping("/{id}/variants/stock")
    fun setAllStock(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("quantity" to products.adminSetAllStock(staff(jwt), id, body["quantity"])), "Stock updated")

    @GetMapping("/{id}/variants")
    fun variants(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, Any?>> {
        staff(jwt)
        return ApiResponse.ok(mapOf("variants" to products.adminVariants(id)))
    }

    @PostMapping("/{id}/variants")
    fun addVariant(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("variant" to products.adminAddVariant(staff(jwt), id, body)), "Variant added"))

    @PutMapping("/{id}/variants/{variantId}")
    fun updateVariant(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @PathVariable variantId: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("variant" to products.adminUpdateVariant(staff(jwt), id, variantId, body)), "Variant updated")

    @DeleteMapping("/{id}/variants/{variantId}")
    fun deleteVariant(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @PathVariable variantId: UUID): ApiResponse<Unit> {
        products.adminDeleteVariant(staff(jwt), id, variantId)
        return ApiResponse(true, "Variant removed")
    }

    // ------------------------------------------------------------ sheets

    @PostMapping("/import")
    fun importCsv(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val result = sheets.csvImport(staff(jwt), body)
        val message = if (result["dryRun"] == true) {
            @Suppress("UNCHECKED_CAST") val s = result["summary"] as Map<String, Any?>
            "${s["creating"]} to create, ${s["updating"]} to update, ${s["variants"]} variant(s)"
        } else "Imported ${result["created"]} new and ${result["updated"]} updated product(s), ${result["variants"]} variant(s)"
        return ApiResponse.ok(result, message)
    }

    @GetMapping("/export")
    fun exportCsv(@AuthenticationPrincipal jwt: Jwt, @RequestParam(required = false) sellerId: String?, @RequestParam(required = false) vendorId: String?): ResponseEntity<ByteArray> {
        staff(jwt)
        return ResponseEntity.ok()
            .contentType(MediaType("text", "csv", Charsets.UTF_8))
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("catalogue.csv").build().toString())
            .body(sheets.csvExport(sellerId ?: vendorId).toByteArray(Charsets.UTF_8))
    }

    @GetMapping("/export/myntra/counts")
    fun myntraCounts(@AuthenticationPrincipal jwt: Jwt, @RequestParam(required = false) ids: String?, @RequestParam(required = false) sellerId: String?,
                     @RequestParam(required = false) vendorId: String?): ApiResponse<Map<String, Any>> {
        staff(jwt)
        return ApiResponse.ok(mapOf("counts" to sheets.myntraCounts(ids, sellerId ?: vendorId)))
    }

    @GetMapping("/export/myntra")
    fun myntra(
        @AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest,
        @RequestParam(required = false) articleType: String?, @RequestParam(required = false) ids: String?,
        @RequestParam(required = false) sellerId: String?, @RequestParam(required = false) vendorId: String?,
    ): ResponseEntity<ByteArray> {
        staff(jwt)
        val base = "${request.scheme}://${request.serverName}${if (request.serverPort in listOf(80, 443)) "" else ":${request.serverPort}"}"
        val export = sheets.myntraExport(articleType, ids, sellerId ?: vendorId, base)
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(export.filename).build().toString())
            .header("X-Export-Rows", export.rows.toString())
            .header("X-Export-Skipped", export.skipped.joinToString(",").take(2000))
            .body(export.bytes)
    }
}

@RestController
@RequestMapping("/api/admin/catalog-import")
class AdminCatalogImportController(private val sheets: CatalogSheetService, private val access: AdminAccess) {

    @PostMapping("/review", consumes = ["multipart/form-data"])
    fun review(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestPart("files", required = false) files: List<MultipartFile>?,
        @RequestParam(required = false) overrides: String?,
        @RequestParam(required = false) sellerId: String?,
    ): ApiResponse<Map<String, Any?>> {
        access.require(jwt, AdminPermission.MODERATOR)
        val sheetFiles = (files ?: emptyList()).take(20).map { SheetFile(it.originalFilename ?: "sheet.xlsx", it.bytes) }
        val result = sheets.review(sheetFiles, overrides, sellerId)
        @Suppress("UNCHECKED_CAST") val summary = result["summary"] as Map<String, Any?>
        return ApiResponse.ok(result, "${summary["products"]} product(s) across ${sheetFiles.size} file(s)")
    }

    @PostMapping("/commit")
    fun commit(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val result = sheets.commit(access.require(jwt, AdminPermission.MODERATOR), body)
        return ApiResponse.ok(result, "Listed ${result["created"]} new and ${result["updated"]} updated product(s), ${result["variants"]} size(s)")
    }
}

@RestController
@RequestMapping("/api/admin/categories")
class AdminCategoryController(private val categories: CategoryService, private val access: AdminAccess) {
    private fun staff(jwt: Jwt, body: Map<String, Any?>? = null): UUID {
        val admin = access.require(jwt, AdminPermission.MODERATOR, AdminPermission.CONTENT)
        // Commission is money: changing it needs FINANCE too.
        if (body != null && categories.touchesCommission(body)) access.require(jwt, AdminPermission.FINANCE)
        return admin
    }

    @GetMapping
    fun list(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any?>> {
        staff(jwt)
        return ApiResponse.ok(mapOf("categories" to categories.adminList()), "Categories fetched")
    }

    @PostMapping
    fun create(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Any?>) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("category" to categories.create(staff(jwt, body), body)), "Category created"))

    @PutMapping("/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("category" to categories.update(staff(jwt, body), id, body)), "Category saved")

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Unit> {
        val name = categories.delete(staff(jwt), id)
        return ApiResponse(true, "$name deleted")
    }

    @GetMapping("/{id}/fields")
    fun fields(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, Any?>> {
        staff(jwt)
        return ApiResponse.ok(categories.describeFields(id))
    }

    @PostMapping("/{id}/fields")
    fun createField(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>): ResponseEntity<ApiResponse<Map<String, Any?>>> {
        val field = categories.createField(staff(jwt), id, body)
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("field" to field), "${field["label"]} added"))
    }

    @PutMapping("/{id}/fields/order")
    fun reorder(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Unit> {
        categories.reorderFields(staff(jwt), id, body["ids"])
        return ApiResponse(true, "Order saved")
    }

    @PutMapping("/{id}/fields/{fieldId}")
    fun updateField(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @PathVariable fieldId: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val field = categories.updateField(staff(jwt), id, fieldId, body)
        return ApiResponse.ok(mapOf("field" to field), "${field["label"]} saved")
    }

    @DeleteMapping("/{id}/fields/{fieldId}")
    fun deleteField(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @PathVariable fieldId: UUID): ApiResponse<Unit> {
        categories.deleteField(staff(jwt), id, fieldId)
        return ApiResponse(true, "Field deleted. Products keep the values they already had.")
    }
}

@RestController
@RequestMapping("/api/admin/brands")
class AdminBrandController(private val brands: BrandService, private val access: AdminAccess) {
    private fun staff(jwt: Jwt) = access.require(jwt, AdminPermission.MODERATOR)

    @GetMapping
    fun list(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any?>> {
        staff(jwt)
        return ApiResponse.ok(mapOf("brands" to brands.adminList()))
    }

    @GetMapping("/authorizations")
    fun authorizations(@AuthenticationPrincipal jwt: Jwt, @RequestParam(required = false) status: String?): ApiResponse<Map<String, Any?>> {
        staff(jwt)
        return ApiResponse.ok(mapOf("authorizations" to brands.authorizations(status)))
    }

    @PostMapping
    fun create(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Any?>) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("brand" to brands.adminCreate(staff(jwt), body)), "Brand created"))

    @PutMapping("/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>) =
        ApiResponse.ok(mapOf("brand" to brands.adminUpdate(staff(jwt), id, body)), "Brand updated")

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Map<String, Any?>> {
        val (message, brand) = brands.adminDelete(staff(jwt), id)
        return ApiResponse(true, message, brand?.let { mapOf("brand" to it) })
    }

    @PatchMapping("/{id}/review")
    fun review(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val sellerId = (body["sellerId"] as? String)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        val brand = brands.review(staff(jwt), id, body["decision"] as? String, (body["reason"] ?: body["note"]) as? String, sellerId)
        return ApiResponse.ok(mapOf("brand" to brand), if (body["decision"] == "approve") "Brand approved" else "Brand rejected")
    }

    @GetMapping("/{id}/authorization-doc")
    fun document(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestParam(required = false) sellerId: UUID?): ApiResponse<Map<String, String>> {
        staff(jwt)
        return ApiResponse.ok(mapOf("url" to brands.adminDocumentUrl(id, sellerId)))
    }
}

@RestController
@RequestMapping("/api/admin")
class AdminModerationController(
    private val products: ProductService,
    private val queries: AdminProductQueries,
    private val access: AdminAccess,
) {
    @GetMapping("/moderation/products")
    fun queue(@AuthenticationPrincipal jwt: Jwt, @RequestParam(required = false) status: String?): ApiResponse<Map<String, Any?>> {
        access.require(jwt, AdminPermission.MODERATOR)
        return ApiResponse.ok(products.moderationQueue(status))
    }

    @PatchMapping("/moderation/products/{id}")
    fun decide(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val product = products.moderate(access.require(jwt, AdminPermission.MODERATOR), id, body["decision"] as? String, body["note"] as? String)
        return ApiResponse.ok(mapOf("product" to product), if (body["decision"] == "approve") "Listing approved" else "Listing sent back to the seller")
    }

    @GetMapping("/inventory")
    fun inventory(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any?>> {
        access.require(jwt, AdminPermission.MODERATOR, AdminPermission.SUPPORT)
        return ApiResponse.ok(mapOf("products" to queries.inventory()))
    }

    @GetMapping("/inventory/movements")
    fun movements(@AuthenticationPrincipal jwt: Jwt, @RequestParam(required = false) productId: UUID?, @RequestParam(defaultValue = "100") limit: Int): ApiResponse<Map<String, Any?>> {
        access.require(jwt, AdminPermission.MODERATOR, AdminPermission.SUPPORT)
        return ApiResponse.ok(mapOf("movements" to queries.movements(productId, limit)))
    }
}
