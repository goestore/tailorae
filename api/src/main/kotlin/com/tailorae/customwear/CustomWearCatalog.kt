package com.tailorae.customwear

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID
import kotlin.math.abs
import kotlin.math.ceil

// ================================================================ taxonomy

/**
 * The fixed custom-wear taxonomy, mirrored from `web/src/config/custom-wear/taxonomy.ts`
 * — option ids are URL filter values there, so they must match exactly.
 */
object CustomWearTaxonomy {
    val GENDERS = setOf("men", "women", "kids", "unisex")
    val PRODUCT_TYPES = setOf("polo", "round-neck", "hoodie", "sweatshirt", "sportswear")
    val FABRICS = setOf("cotton-100", "cotton-blend", "polyester", "performance-polyester", "dry-fit", "organic-cotton", "recycled-polyester")
    val METHODS = setOf("screen-printing", "dtg", "dtf", "sublimation", "heat-transfer", "embroidery", "puff-printing", "vinyl-printing")
    val LOCATIONS = setOf("left-chest", "right-chest", "centre-front", "full-front", "upper-back", "full-back", "left-sleeve", "right-sleeve")
    val BADGES = setOf("new", "bestseller", "premium", "eco-friendly", "no-moq", "new-options")
    val IMAGE_ROLES = setOf("front", "back", "side", "detail", "fabric", "customization", "lifestyle", "spec")
    val SIZE_GROUPS = setOf("adult", "kids")
    val SORTS = setOf("recommended", "popular", "newest", "price-asc", "price-desc", "rating")

    data class Category(val id: String, val gender: String, val productType: String, val fullLabel: String)

    data class Bucket(val id: String, val min: Int, val max: Int?)

    val GSM_BUCKETS = listOf(
        Bucket("under-160", 0, 160), Bucket("160-180", 160, 180), Bucket("180-200", 180, 200),
        Bucket("200-240", 200, 240), Bucket("240-plus", 240, null),
    )

    /** A product qualifies for a MOQ bucket when its minimum order is at most the bucket's figure. */
    val MOQ_BUCKETS = listOf(
        "no-moq" to 1, "10-plus" to 10, "25-plus" to 25, "50-plus" to 50, "100-plus" to 100, "250-plus" to 250, "500-plus" to 500,
    ).toMap()

    val CATEGORIES: List<Category> = run {
        val types = listOf(
            Triple("polo", "polo", "Polo T-Shirts"),
            Triple("round-neck", "round-neck", "Round Neck T-Shirts"),
            Triple("hoodies", "hoodie", "Hoodies"),
            Triple("sweatshirts", "sweatshirt", "Sweatshirts"),
            Triple("sports-wear", "sportswear", "Sports Wear"),
        )
        // Possessives as the web builds them (it passes "Kid's" for kids).
        listOf(Triple("men", "mens", "Men's"), Triple("women", "womens", "Women's"), Triple("kids", "kids", "Kid's"))
            .flatMap { (gender, prefix, possessive) ->
                types.map { (id, type, label) -> Category("$prefix-$id", gender, type, "Customize $possessive $label") }
            }
    }

    fun category(id: String?): Category? = id?.let { wanted -> CATEGORIES.firstOrNull { it.id == wanted } }
}

// ================================================================ product shape

data class ProductColor(
    @field:NotBlank @field:Size(max = 60) val id: String,
    @field:NotBlank @field:Size(max = 80) val name: String,
    @field:NotBlank @field:Size(max = 20) val hex: String,
    val secondaryHex: String? = null,
    val imageId: String? = null,
    val skuSuffix: String? = null,
    val inStock: Boolean? = null,
)

data class ProductSize(
    @field:NotBlank @field:Size(max = 20) val id: String,
    @field:NotBlank @field:Size(max = 40) val label: String,
    val group: String = "adult",
    val inStock: Boolean? = null,
)

data class PriceTier(val minQty: Int, val maxQty: Int? = null, val pricePerUnitPaise: Long)

data class ProductImage(
    @field:NotBlank @field:Size(max = 60) val id: String,
    @field:NotBlank @field:Size(max = 500) val url: String,
    val alt: String = "",
    val role: String = "front",
    val colorId: String? = null,
)

data class CustomizationMethodOption(
    val id: String,
    /** Unsupported methods stay visible but disabled, so buyers see the full range. */
    val supported: Boolean,
    val setupFeePaise: Long? = null,
    val pricePerUnitPaise: Long? = null,
    val note: String? = null,
)

data class CustomizationLocationOption(
    val id: String,
    val supported: Boolean,
    val maxWidthMm: Int? = null,
    val maxHeightMm: Int? = null,
    val pricePerUnitPaise: Long? = null,
)

data class ProductSpecRow(val label: String, val value: String)

data class ProductTemplateAsset(val id: String, val label: String, val fileType: String, val url: String, val description: String? = null)

data class ProductAccordionSection(
    val id: String,
    val title: String,
    /** Plain paragraphs, rendered as text — never as HTML. */
    val paragraphs: List<String>? = null,
    val bullets: List<String>? = null,
    val specs: List<ProductSpecRow>? = null,
    val templates: List<ProductTemplateAsset>? = null,
)

data class ProductDescriptionBlock(val heading: String, val intro: String? = null, val benefits: List<String>? = null, val useCases: List<String>? = null)

data class SizeChartRow(val size: String, val values: List<String>)

data class SizeChart(val unit: String, val columns: List<String>, val rows: List<SizeChartRow>, val note: String? = null)

/** The web's `CustomWearProduct`, with money in paise. */
data class CustomWearProduct(
    val id: UUID,
    val slug: String,
    val sku: String,
    val name: String,
    val shortDescription: String,
    val description: String,
    val gender: String,
    val category: String,
    val productType: String,
    val fabric: String?,
    val gsm: Int?,
    val fit: String?,
    val basePricePaise: Long,
    val currency: String,
    /** Highest per-unit price across tiers, for the "₹450 – ₹570 each" range on cards. */
    val maxPricePaise: Long?,
    val priceTiers: List<PriceTier>,
    val colors: List<ProductColor>,
    val sizes: List<ProductSize>,
    val customizationMethods: List<CustomizationMethodOption>,
    val customizationLocations: List<CustomizationLocationOption>,
    val images: List<ProductImage>,
    val rating: Double,
    val reviewCount: Int,
    val badges: List<String>,
    val minOrderQuantity: Int,
    val defaultQuantity: Int?,
    val highlights: List<String>,
    val accordions: List<ProductAccordionSection>,
    val descriptionBlock: ProductDescriptionBlock?,
    val sizeChart: SizeChart?,
    val relatedProductIds: List<UUID>,
    val popularity: Int,
    val isActive: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
)

/** Create or fully replace a product (staff). */
data class CustomWearProductRequest(
    @field:NotBlank @field:Size(max = 200) val name: String,
    @field:Size(max = 160) val slug: String? = null,
    @field:NotBlank @field:Size(max = 80) val sku: String,
    @field:Size(max = 500) val shortDescription: String = "",
    @field:Size(max = 10_000) val description: String = "",
    @field:NotBlank val gender: String,
    @field:NotBlank val category: String,
    @field:NotBlank val productType: String,
    val fabric: String? = null,
    val gsm: Int? = null,
    @field:Size(max = 80) val fit: String? = null,
    val basePricePaise: Long,
    val maxPricePaise: Long? = null,
    @field:Size(min = 3, max = 3) val currency: String = "INR",
    val priceTiers: List<PriceTier> = emptyList(),
    @field:Valid val colors: List<ProductColor> = emptyList(),
    @field:Valid val sizes: List<ProductSize> = emptyList(),
    val customizationMethods: List<CustomizationMethodOption> = emptyList(),
    val customizationLocations: List<CustomizationLocationOption> = emptyList(),
    @field:Valid val images: List<ProductImage> = emptyList(),
    val rating: Double = 0.0,
    val reviewCount: Int = 0,
    val badges: List<String> = emptyList(),
    val minOrderQuantity: Int = 1,
    val defaultQuantity: Int? = null,
    val highlights: List<String> = emptyList(),
    val accordions: List<ProductAccordionSection> = emptyList(),
    val descriptionBlock: ProductDescriptionBlock? = null,
    val sizeChart: SizeChart? = null,
    val relatedProductIds: List<UUID> = emptyList(),
    val popularity: Int = 0,
    val isActive: Boolean = true,
)

object CustomWearProductRules {
    /** Everything wrong with a product write, in user-facing words; empty when valid. */
    fun validate(req: CustomWearProductRequest): List<String> {
        val t = CustomWearTaxonomy
        val errors = mutableListOf<String>()
        if (req.gender !in t.GENDERS) errors += "gender must be one of ${t.GENDERS.joinToString(", ")}"
        if (req.productType !in t.PRODUCT_TYPES) errors += "productType must be one of ${t.PRODUCT_TYPES.joinToString(", ")}"
        val category = t.category(req.category)
        if (category == null) errors += "category must be a custom wear category id, e.g. mens-polo"
        else if (req.productType in t.PRODUCT_TYPES && category.productType != req.productType) {
            errors += "category ${category.id} is for ${category.productType} products"
        }
        if (req.fabric != null && req.fabric !in t.FABRICS) errors += "fabric must be one of ${t.FABRICS.joinToString(", ")}"
        if (req.gsm != null && req.gsm !in 50..1000) errors += "gsm must be between 50 and 1000"
        if (req.basePricePaise < 0) errors += "basePricePaise cannot be negative"
        if (req.maxPricePaise != null && req.maxPricePaise < req.basePricePaise) errors += "maxPricePaise cannot be below basePricePaise"
        if (req.minOrderQuantity < 1) errors += "minOrderQuantity must be at least 1"
        if (req.defaultQuantity != null && req.defaultQuantity < req.minOrderQuantity) errors += "defaultQuantity cannot be below minOrderQuantity"
        if (req.rating !in 0.0..5.0) errors += "rating must be between 0 and 5"
        if (req.reviewCount < 0 || req.popularity < 0) errors += "reviewCount and popularity cannot be negative"

        val tiers = req.priceTiers.sortedBy { it.minQty }
        tiers.forEachIndexed { i, tier ->
            if (tier.minQty < 1) errors += "priceTiers[$i].minQty must be at least 1"
            if (tier.maxQty != null && tier.maxQty < tier.minQty) errors += "priceTiers[$i].maxQty cannot be below minQty"
            if (tier.pricePerUnitPaise < 0) errors += "priceTiers[$i].pricePerUnitPaise cannot be negative"
            val next = tiers.getOrNull(i + 1)
            if (next != null && (tier.maxQty == null || tier.maxQty >= next.minQty)) errors += "priceTiers must not overlap"
        }
        if (req.colors.map { it.id }.toSet().size != req.colors.size) errors += "colors must have unique ids"
        if (req.sizes.map { it.id }.toSet().size != req.sizes.size) errors += "sizes must have unique ids"
        if (req.sizes.any { it.group !in t.SIZE_GROUPS }) errors += "sizes[].group must be adult or kids"
        if (req.images.any { it.role !in t.IMAGE_ROLES }) errors += "images[].role must be one of ${t.IMAGE_ROLES.joinToString(", ")}"
        if (req.customizationMethods.any { it.id !in t.METHODS }) errors += "customizationMethods[].id must be one of ${t.METHODS.joinToString(", ")}"
        if (req.customizationLocations.any { it.id !in t.LOCATIONS }) errors += "customizationLocations[].id must be one of ${t.LOCATIONS.joinToString(", ")}"
        if (req.customizationMethods.any { (it.setupFeePaise ?: 0) < 0 || (it.pricePerUnitPaise ?: 0) < 0 } ||
            req.customizationLocations.any { (it.pricePerUnitPaise ?: 0) < 0 }
        ) errors += "customization prices cannot be negative"
        if (req.badges.any { it !in t.BADGES }) errors += "badges must be from ${t.BADGES.joinToString(", ")}"
        return errors.distinct()
    }

    /** The card's price range: the highest per-unit price on offer. */
    fun maxPrice(req: CustomWearProductRequest): Long =
        req.maxPricePaise ?: (req.priceTiers.map { it.pricePerUnitPaise } + req.basePricePaise).max()
}

// ================================================================ querying

/** The web's `CustomWearFilterState` (multi-selects are OR within a group, AND across). */
data class CustomWearFilters(
    val category: String? = null,
    val gender: List<String> = emptyList(),
    val productType: List<String> = emptyList(),
    val color: List<String> = emptyList(),
    val size: List<String> = emptyList(),
    val fabric: List<String> = emptyList(),
    val gsm: List<String> = emptyList(),
    val method: List<String> = emptyList(),
    val location: List<String> = emptyList(),
    val moq: List<String> = emptyList(),
    val minPricePaise: Long? = null,
    val maxPricePaise: Long? = null,
    val search: String = "",
    val sort: String = "recommended",
    val page: Int = 1,
    /** Restricts to these products (the web's `fetchCustomWearProductsByIds`). */
    val ids: List<UUID> = emptyList(),
)

data class PriceBounds(val minPaise: Long, val maxPaise: Long)

data class ProductQueryResult(
    val products: List<CustomWearProduct>,
    val total: Int,
    val page: Int,
    val pageSize: Int,
    val pageCount: Int,
    /** Lowest/highest base price across the unfiltered catalogue. */
    val priceBounds: PriceBounds,
)

/**
 * The filter, sort and related-products engine, ported from
 * `web/src/lib/custom-wear/filters.ts` so the server answers exactly what the
 * client-side engine did. The catalogue is a curated, staff-managed list (tens
 * of products), so it runs over the active rows in memory.
 */
object CustomWearQuery {
    const val PAGE_SIZE = 24

    fun matches(product: CustomWearProduct, f: CustomWearFilters): Boolean {
        val category = CustomWearTaxonomy.category(f.category)
        if (category != null && product.category != category.id) {
            // Unisex products belong to the matching type in every gender's listing.
            if (!(product.gender == "unisex" && product.productType == category.productType)) return false
        }
        if (f.ids.isNotEmpty() && product.id !in f.ids) return false
        if (f.gender.isNotEmpty() && product.gender !in f.gender) return false
        if (f.productType.isNotEmpty() && product.productType !in f.productType) return false
        if (f.color.isNotEmpty() && product.colors.none { it.id in f.color }) return false
        if (f.size.isNotEmpty() && product.sizes.none { it.id in f.size }) return false
        if (f.fabric.isNotEmpty() && (product.fabric == null || product.fabric !in f.fabric)) return false
        if (f.gsm.isNotEmpty()) {
            val gsm = product.gsm ?: return false
            val hit = f.gsm.any { id ->
                CustomWearTaxonomy.GSM_BUCKETS.firstOrNull { it.id == id }?.let { gsm >= it.min && (it.max == null || gsm < it.max) } ?: false
            }
            if (!hit) return false
        }
        if (f.method.isNotEmpty() && product.customizationMethods.none { it.supported && it.id in f.method }) return false
        if (f.location.isNotEmpty() && product.customizationLocations.none { it.supported && it.id in f.location }) return false
        if (f.moq.isNotEmpty() && f.moq.none { id -> CustomWearTaxonomy.MOQ_BUCKETS[id]?.let { product.minOrderQuantity <= it } ?: false }) return false
        if (f.minPricePaise != null && product.basePricePaise < f.minPricePaise) return false
        if (f.maxPricePaise != null && product.basePricePaise > f.maxPricePaise) return false
        val q = f.search.trim().lowercase()
        if (q.isNotEmpty() && !searchableText(product).contains(q)) return false
        return true
    }

    fun query(catalogue: List<CustomWearProduct>, f: CustomWearFilters, pageSize: Int = PAGE_SIZE): ProductQueryResult {
        val sorted = catalogue.filter { matches(it, f) }.sortedWith(sorter(f.sort))
        val size = pageSize.coerceIn(1, 100)
        val total = sorted.size
        val pageCount = maxOf(1, ceil(total / size.toDouble()).toInt())
        val page = f.page.coerceIn(1, pageCount)
        val prices = catalogue.map { it.basePricePaise }
        return ProductQueryResult(
            products = sorted.drop((page - 1) * size).take(size),
            total = total,
            page = page,
            pageSize = size,
            pageCount = pageCount,
            priceBounds = PriceBounds(prices.minOrNull() ?: 0, prices.maxOrNull() ?: 0),
        )
    }

    /**
     * Related products: explicit `relatedProductIds` first, then ranked by same
     * type (5), same gender (4), same category (3), similar price (2 within 25%,
     * 1 within 50%) and shared supported methods (up to 3).
     */
    fun related(product: CustomWearProduct, catalogue: List<CustomWearProduct>, limit: Int = 6): List<CustomWearProduct> {
        val explicit = product.relatedProductIds.mapNotNull { id -> catalogue.firstOrNull { it.id == id } }
        val methods = product.customizationMethods.filter { it.supported }.map { it.id }.toSet()
        val scored = catalogue
            .filter { c -> c.id != product.id && explicit.none { it.id == c.id } }
            .map { c ->
                var score = 0
                if (c.productType == product.productType) score += 5
                if (c.gender == product.gender) score += 4
                if (c.category == product.category) score += 3
                val gap = abs(c.basePricePaise - product.basePricePaise).toDouble() / product.basePricePaise
                if (gap <= 0.25) score += 2 else if (gap <= 0.5) score += 1
                score += minOf(c.customizationMethods.count { it.supported && it.id in methods }, 3)
                c to score
            }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<CustomWearProduct, Int>> { it.second }.thenByDescending { it.first.popularity })
        return (explicit + scored.map { it.first }).take(limit)
    }

    private fun searchableText(p: CustomWearProduct): String =
        (
            listOf(p.name, p.sku, p.shortDescription, p.productType, p.gender, p.fabric ?: "", p.category,
                CustomWearTaxonomy.category(p.category)?.fullLabel ?: "") + p.badges + p.colors.map { it.name }
            ).joinToString(" ").lowercase()

    private fun sorter(sort: String): Comparator<CustomWearProduct> = when (sort) {
        "popular" -> compareByDescending { it.popularity }
        "newest" -> compareByDescending { it.createdAt }
        "price-asc" -> compareBy { it.basePricePaise }
        "price-desc" -> compareByDescending { it.basePricePaise }
        "rating" -> compareByDescending<CustomWearProduct> { it.rating }.thenByDescending { it.reviewCount }
        else -> compareByDescending { it.popularity * it.rating }
    }
}
