package com.tailorae.commerce

import com.tailorae.common.ApiResponse
import com.tailorae.common.BadRequestException
import com.tailorae.common.PageParams
import com.tailorae.common.PublicEndpoint
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.accountId
import com.tailorae.common.toResponse
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
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@Configuration
class CommerceModuleConfig {
    @Bean
    fun commercePublicEndpoints() = PublicEndpoints(
        listOf(
            PublicEndpoint(HttpMethod.GET, "/api/products/*/reviews"),
            PublicEndpoint(HttpMethod.POST, "/api/reviews/*/vote"),
            PublicEndpoint(HttpMethod.GET, "/api/delivery/pincode/*"),
            PublicEndpoint(HttpMethod.POST, "/api/delivery/eta"),
        ),
    )
}

/** The shopper's bag. Responses keep the legacy `{ cart }` wrapper. */
@RestController
@RequestMapping("/api/cart")
class CartController(private val cart: CartService) {
    @GetMapping
    fun get(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("cart" to cart.view(jwt.accountId())), "Cart fetched")

    @PostMapping("/items")
    fun add(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: AddToCartRequest) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("cart" to cart.add(jwt.accountId(), body)), "Item added to cart"))

    @PatchMapping("/items/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Int>): ApiResponse<Map<String, CartView>> {
        val qty = body["quantity"] ?: throw BadRequestException("quantity must be an integer of 0 or more")
        return ApiResponse.ok(mapOf("cart" to cart.update(jwt.accountId(), id, qty)), if (qty == 0) "Item removed from cart" else "Cart item updated")
    }

    @DeleteMapping("/items/{id}")
    fun remove(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID) =
        ApiResponse.ok(mapOf("cart" to cart.remove(jwt.accountId(), id)), "Item removed from cart")

    @DeleteMapping
    fun clear(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("cart" to cart.clear(jwt.accountId())), "Cart cleared")
}

/** Addresses and wishlist, at the legacy `/api/users/...` paths. */
@RestController
@RequestMapping("/api/users")
class ShopperController(private val addresses: AddressService, private val wishlist: WishlistService) {
    @GetMapping("/addresses")
    fun addresses(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("addresses" to addresses.list(jwt.accountId())))

    @PostMapping("/addresses")
    fun addAddress(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: AddressRequest) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(mapOf("address" to addresses.create(jwt.accountId(), body)), "Address saved"))

    @PutMapping("/addresses/{id}")
    fun updateAddress(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @Valid @RequestBody body: AddressRequest) =
        ApiResponse.ok(mapOf("address" to addresses.update(jwt.accountId(), id, body)), "Address updated")

    @DeleteMapping("/addresses/{id}")
    fun deleteAddress(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Unit> {
        addresses.delete(jwt.accountId(), id)
        return ApiResponse(true, "Address removed")
    }

    @GetMapping("/wishlist")
    fun wishlist(@AuthenticationPrincipal jwt: Jwt) = ApiResponse.ok(mapOf("items" to wishlist.list(jwt.accountId())))

    @PostMapping("/wishlist")
    fun addToWishlist(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, UUID>): ApiResponse<Map<String, List<WishlistEntry>>> {
        val productId = body["productId"] ?: throw BadRequestException("productId is required")
        return ApiResponse.ok(mapOf("items" to wishlist.add(jwt.accountId(), productId)), "Saved to your wishlist")
    }

    @DeleteMapping("/wishlist/{productId}")
    fun removeFromWishlist(@AuthenticationPrincipal jwt: Jwt, @PathVariable productId: UUID) =
        ApiResponse.ok(mapOf("items" to wishlist.remove(jwt.accountId(), productId)), "Removed from your wishlist")
}

@RestController
class CouponController(private val coupons: CouponService, private val access: AdminAccess) {
    @PostMapping("/api/coupons/apply")
    fun apply(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, String>): ApiResponse<CouponPreview> {
        val code = body["code"]?.takeIf { it.isNotBlank() } ?: throw BadRequestException("Enter a coupon code")
        return ApiResponse.ok(coupons.preview(jwt.accountId(), code), "Coupon applied")
    }

    @GetMapping("/api/admin/coupons")
    fun list(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) q: String?,
    ): ResponseEntity<ApiResponse<com.tailorae.common.Page<Map<String, Any?>>>> {
        access.require(jwt, AdminPermission.FINANCE, AdminPermission.CONTENT)
        return coupons.adminList(PageParams(page, limit), q).toResponse()
    }

    @PostMapping("/api/admin/coupons")
    fun create(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody body: CouponRequest) =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(coupons.save(access.require(jwt, AdminPermission.FINANCE, AdminPermission.CONTENT), null, body), "Coupon created"))

    @PutMapping("/api/admin/coupons/{id}")
    fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @Valid @RequestBody body: CouponRequest) =
        ApiResponse.ok(coupons.save(access.require(jwt, AdminPermission.FINANCE, AdminPermission.CONTENT), id, body), "Coupon saved")

    @DeleteMapping("/api/admin/coupons/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Unit> {
        coupons.delete(access.require(jwt, AdminPermission.FINANCE, AdminPermission.CONTENT), id)
        return ApiResponse(true, "Coupon removed")
    }
}

@RestController
class ReviewController(private val reviews: ReviewService, private val access: AdminAccess) {
    @GetMapping("/api/products/{productId}/reviews")
    fun list(
        @PathVariable productId: UUID,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "10") limit: Int,
    ): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val (items, summary) = reviews.forProduct(productId, PageParams(page, limit))
        return ResponseEntity.ok().header("X-Total-Count", items.total.toString())
            .body(ApiResponse.ok(mapOf("reviews" to items.items, "summary" to summary, "total" to items.total)))
    }

    @PostMapping("/api/products/{productId}/reviews")
    fun post(@AuthenticationPrincipal jwt: Jwt, @PathVariable productId: UUID, @Valid @RequestBody body: ReviewRequest) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(reviews.upsert(jwt.accountId(), productId, body), "Thanks for your review"))

    @PostMapping("/api/reviews/{id}/vote")
    fun vote(@PathVariable id: UUID, @RequestBody body: Map<String, Boolean>): ApiResponse<Unit> {
        reviews.vote(id, body["helpful"] ?: true)
        return ApiResponse(true, "Thanks for the feedback")
    }

    @GetMapping("/api/admin/reviews")
    fun adminList(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) published: Boolean?,
    ): ResponseEntity<ApiResponse<com.tailorae.common.Page<ReviewView>>> {
        access.require(jwt, AdminPermission.MODERATOR)
        return reviews.adminList(PageParams(page, limit), published).toResponse()
    }

    @PatchMapping("/api/admin/reviews/{id}")
    fun moderate(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, Boolean>): ApiResponse<Unit> {
        val published = body["isPublished"] ?: throw BadRequestException("isPublished must be true or false")
        reviews.setPublished(access.require(jwt, AdminPermission.MODERATOR), id, published)
        return ApiResponse(true, if (published) "Review published" else "Review hidden")
    }

    @DeleteMapping("/api/admin/reviews/{id}")
    fun delete(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID): ApiResponse<Unit> {
        reviews.delete(access.require(jwt, AdminPermission.MODERATOR), id)
        return ApiResponse(true, "Review deleted")
    }
}

@RestController
@RequestMapping("/api/delivery")
class DeliveryController(private val delivery: DeliveryService) {
    @GetMapping("/pincode/{pin}")
    fun pincode(@PathVariable pin: String): ApiResponse<PincodeInfo> {
        if (!delivery.isPincode(pin)) throw BadRequestException("Enter a valid 6-digit pincode.")
        return ApiResponse.ok(delivery.lookup(pin) ?: PincodeInfo(pin, true, "", "", ""), "Pincode checked")
    }

    @PostMapping("/eta")
    fun eta(@RequestBody body: Map<String, String>): ApiResponse<DeliveryEstimate> {
        val pin = body["pincode"]?.trim().orEmpty()
        if (!delivery.isPincode(pin)) throw BadRequestException("Enter a valid 6-digit pincode.")
        val estimate = delivery.estimate(pin)
        return ApiResponse.ok(estimate, if (estimate.serviceable) "Delivery estimate" else "Not serviceable")
    }
}
