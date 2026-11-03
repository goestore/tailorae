package com.tailorae.catalog.rules

data class VariantLike(
    val id: String,
    val color: String?,
    val size: String?,
    val sku: String,
    val quantity: Int,
    val images: List<String>,
    val isDefault: Boolean = false,
    val colorFamily: String? = null,
)

data class ProductLike(
    val thumbnail: String?,
    val images: List<String>,
    val color: String?,
    val quantity: Int = 0,
    val colourHexes: Map<String, Any?>? = null,
    val colorFamily: String? = null,
)

/** One grid tile per colour. */
data class ColorCard(
    /** Stable within the product — the colour name is the identity here. */
    val id: String,
    val name: String,
    val hex: String?,
    /** First image of the colour, used as the grid tile. */
    val image: String?,
    /** Sum of the sizes underneath, so a colour can be shown as sold out. */
    val stock: Int,
    /** The fixed colour family it files under; what the filter matches on. */
    val family: String?,
)

data class SizeStock(val id: String, val size: String?, val sku: String, val stock: Int)

data class ColorDetail(
    val id: String,
    val name: String,
    val hex: String?,
    val family: String?,
    val image: String?,
    val images: List<String>,
    val sizes: List<SizeStock>,
    val stock: Int,
)

/**
 * Colour cards, derived from a product's size variants (port of
 * legacy-api/src/utils/product-colors.ts). The shop grid renders one tile per
 * colour; the product page groups sizes under each colour.
 */
object ProductColors {
    private fun colorKey(value: String) = value.trim().lowercase()

    /** The seller's chosen swatch for a colour, matched case-insensitively. */
    fun swatchHex(colourHexes: Map<String, Any?>?, name: String): String? {
        if (colourHexes == null) return null
        val wanted = colorKey(name)
        for ((key, hex) in colourHexes) if (colorKey(key) == wanted && hex is String) return hex
        return null
    }

    /**
     * The seller's shade, else the family's own, else none. Multi has no single
     * shade: leaving it null lets the storefront draw the colours from the name.
     */
    private fun shadeFor(product: ProductLike, name: String, family: String?): String? =
        swatchHex(product.colourHexes, name)
            ?: if (family != null && family != "Multi") ColourFamilies.byName(family)?.hex else null

    private fun familyOf(variants: List<VariantLike>): String? = variants.firstOrNull { it.colorFamily != null }?.colorFamily

    private data class Group(val name: String, val variants: MutableList<VariantLike>)

    /** Group variants by colour, preserving the order they were returned in. */
    private fun groupByColor(variants: List<VariantLike>): LinkedHashMap<String, Group> {
        val groups = LinkedHashMap<String, Group>()
        for (variant in variants) {
            val name = variant.color?.trim().orEmpty()
            if (name.isEmpty()) continue
            groups.getOrPut(colorKey(name)) { Group(name, mutableListOf()) }.variants += variant
        }
        return groups
    }

    private fun productImage(product: ProductLike): String? =
        product.thumbnail?.takeIf { it.isNotEmpty() } ?: product.images.firstOrNull()

    private fun firstImage(variants: List<VariantLike>, product: ProductLike): String? =
        variants.firstOrNull { it.images.isNotEmpty() }?.images?.first() ?: productImage(product)

    /**
     * Lightweight colour cards for the listing grid. Empty when the product has
     * no colour information: the grid then renders one tile for the product.
     */
    fun cards(p: ProductLike, v: List<VariantLike>): List<ColorCard> {
        val groups = groupByColor(v)
        if (groups.isEmpty()) {
            val own = p.color?.trim().orEmpty()
            if (own.isEmpty()) return emptyList()
            return listOf(ColorCard(colorKey(own), own, shadeFor(p, own, p.colorFamily), productImage(p), p.quantity, p.colorFamily))
        }
        return groups.map { (key, group) ->
            ColorCard(
                id = key,
                name = group.name,
                hex = shadeFor(p, group.name, familyOf(group.variants)),
                image = firstImage(group.variants, p),
                stock = group.variants.sumOf { maxOf(0, it.quantity) },
                family = familyOf(group.variants),
            )
        }
    }

    /**
     * What can actually be bought. With variants, their sum is the truth; the
     * product's own quantity is not kept in step with them.
     */
    fun effectiveStock(quantity: Int, variantQuantities: List<Int>): Int =
        if (variantQuantities.isEmpty()) quantity else variantQuantities.sumOf { maxOf(0, it) }

    private fun firstNumber(size: String): Double =
        Regex("\\d+(\\.\\d+)?").find(size)?.value?.toDouble() ?: Double.POSITIVE_INFINITY

    /**
     * Sizes in the order a shopper reads them: the catalogue's size order, then
     * by the first number in the label (2-3Y before 11-12Y), then alphabetically.
     */
    val sizeOrder: Comparator<String?> = Comparator { a, b ->
        val x = a?.trim().orEmpty()
        val y = b?.trim().orEmpty()
        val order = Catalogue.SIZE_ORDER
        val rx = order.indexOf(x)
        val ry = order.indexOf(y)
        when {
            rx != -1 && ry != -1 -> rx - ry
            rx != -1 -> -1
            ry != -1 -> 1
            else -> firstNumber(x).compareTo(firstNumber(y)).takeIf { it != 0 } ?: x.compareTo(y, ignoreCase = true)
        }
    }

    /** Colour cards with their sizes, for the product detail page. */
    fun details(p: ProductLike, v: List<VariantLike>): List<ColorDetail> {
        val groups = groupByColor(v)
        if (groups.isEmpty()) return emptyList()
        return groups.map { (key, group) ->
            // A colour's gallery is every distinct image across its sizes.
            val images = group.variants.flatMap { it.images }.distinct()
            val gallery = images.ifEmpty { (listOfNotNull(p.thumbnail) + p.images).filter { it.isNotEmpty() } }
            ColorDetail(
                id = key,
                name = group.name,
                hex = shadeFor(p, group.name, familyOf(group.variants)),
                family = familyOf(group.variants),
                image = gallery.firstOrNull(),
                images = gallery,
                sizes = group.variants.sortedWith { a, b -> sizeOrder.compare(a.size, b.size) }
                    .map { SizeStock(it.id, it.size, it.sku, it.quantity) },
                stock = group.variants.sumOf { it.quantity },
            )
        }
    }

    /** Every distinct colour name in a set of variants, for the filter facets. */
    fun distinctColorNames(colors: List<String?>): List<String> {
        val seen = LinkedHashMap<String, String>()
        for (raw in colors) {
            val name = raw?.trim().orEmpty()
            if (name.isEmpty()) continue
            seen.putIfAbsent(colorKey(name), name)
        }
        return seen.values.sortedWith(String.CASE_INSENSITIVE_ORDER)
    }
}
