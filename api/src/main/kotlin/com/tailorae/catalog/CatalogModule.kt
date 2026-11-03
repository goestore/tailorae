package com.tailorae.catalog

import com.tailorae.catalog.rules.LiveCheckException
import com.tailorae.catalog.rules.MissingField
import com.tailorae.common.ApiResponse
import com.tailorae.common.PublicEndpoints
import com.tailorae.common.TopicSet
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID

/** Kafka topics the catalog publishes (through the outbox). */
object CatalogTopics {
    /** Any change to a product a shopper could notice: created, edited, moderated, discontinued. */
    const val PRODUCT_CHANGED = "catalog.product.changed"

    /**
     * A product or one of its sizes went from out of stock to in stock — what a
     * back-in-stock notifier listens for.
     */
    const val STOCK_CHANGED = "inventory.stock.changed"

    val ALL = listOf(PRODUCT_CHANGED, STOCK_CHANGED)
}

enum class ProductChange { CREATED, UPDATED, MODERATED, DISCONTINUED, STOCK }

data class ProductChanged(
    val productId: UUID,
    val sellerId: UUID,
    val slug: String,
    val change: ProductChange,
    val status: String,
    val moderationStatus: String,
)

data class StockChanged(
    val productId: UUID,
    /** Null when the product itself (it has no sizes) came back into stock. */
    val variantId: UUID?,
    val sellerId: UUID,
    val previousQuantity: Int,
    val quantity: Int,
)

/** The platform's own shop ("TAILORAE Retail"); admin-created listings belong to it. */
object PlatformSeller {
    val ID: UUID = UUID.fromString("01900000-0000-7000-8000-000000000001")
}

@Configuration
class CatalogModuleConfig {
    @Bean
    fun catalogTopics() = TopicSet(CatalogTopics.ALL)

    /** The storefront catalogue and the listing templates are readable by anyone. */
    @Bean
    fun catalogPublicEndpoints() = PublicEndpoints.get("/api/products", "/api/products/**", "/api/catalogue/**")
}

/**
 * A listing that cannot go live yet answers 409 with what is missing, so the
 * form can point at each field. Scoped to this module's controllers and ordered
 * ahead of the shared handler, whose catch-all would otherwise win.
 */
@RestControllerAdvice(basePackages = ["com.tailorae.catalog"])
@Order(Ordered.HIGHEST_PRECEDENCE)
class CatalogExceptionHandler {
    data class LiveCheckBody(val missing: List<MissingField>)

    @ExceptionHandler(LiveCheckException::class)
    fun liveCheck(e: LiveCheckException): ResponseEntity<ApiResponse<LiveCheckBody>> =
        ResponseEntity.status(e.status).body(ApiResponse(false, e.message ?: "Not ready to go live", LiveCheckBody(e.missing)))
}
