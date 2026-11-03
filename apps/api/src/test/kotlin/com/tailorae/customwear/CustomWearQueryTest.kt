package com.tailorae.customwear

import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Ported from the `filtering` cases of web/src/lib/custom-wear/custom-wear.test.ts. */
class CustomWearQueryTest {

    private fun product(
        name: String,
        gender: String,
        type: String,
        category: String,
        pricePaise: Long,
        colors: List<String> = listOf("black"),
        sizes: List<String> = listOf("M"),
        fabric: String? = "cotton-100",
        gsm: Int? = 180,
        moq: Int = 1,
        methods: List<Pair<String, Boolean>> = listOf("screen-printing" to true),
        popularity: Int = 10,
        rating: Double = 4.0,
        created: Long = 0,
        sku: String = name.uppercase().replace(' ', '-'),
    ) = CustomWearProduct(
        id = UUID.nameUUIDFromBytes(name.toByteArray()), slug = name.lowercase().replace(' ', '-'), sku = sku, name = name,
        shortDescription = "", description = "", gender = gender, category = category, productType = type,
        fabric = fabric, gsm = gsm, fit = null, basePricePaise = pricePaise, currency = "INR", maxPricePaise = null,
        priceTiers = emptyList(), colors = colors.map { ProductColor(it, it.replaceFirstChar(Char::uppercase), "#000000") },
        sizes = sizes.map { ProductSize(it, it) },
        customizationMethods = methods.map { (id, ok) -> CustomizationMethodOption(id, ok) },
        customizationLocations = listOf(CustomizationLocationOption("left-chest", true)),
        images = emptyList(), rating = rating, reviewCount = 3, badges = emptyList(), minOrderQuantity = moq,
        defaultQuantity = null, highlights = emptyList(), accordions = emptyList(), descriptionBlock = null, sizeChart = null,
        relatedProductIds = emptyList(), popularity = popularity, isActive = true,
        createdAt = Instant.ofEpochSecond(created), updatedAt = Instant.ofEpochSecond(created),
    )

    private val catalogue = listOf(
        product("Classic Polo", "men", "polo", "mens-polo", 45_000, colors = listOf("black", "navy"), sku = "TL-MP-220-CLS", gsm = 220, popularity = 50),
        product("Sport Polo", "men", "polo", "mens-polo", 52_000, fabric = "dry-fit", gsm = 160, moq = 25, created = 5),
        product("Studio Hoodie", "men", "hoodie", "mens-hoodies", 99_000, colors = listOf("grey"), gsm = 320, popularity = 80, created = 9),
        product("Everyday Polo", "women", "polo", "womens-polo", 47_000, colors = listOf("pink"), sizes = listOf("S"), popularity = 30),
        product("Team Tee", "unisex", "round-neck", "mens-round-neck", 30_000, methods = listOf("dtg" to true, "embroidery" to false), moq = 50),
        product("Kids Polo", "kids", "polo", "kids-polo", 28_000, sizes = listOf("5-6Y"), created = 3),
    )

    private fun total(f: CustomWearFilters) = CustomWearQuery.query(catalogue, f).total

    @Test
    fun `combines filters with AND across groups and OR within a group`() {
        val all = total(CustomWearFilters())
        val men = total(CustomWearFilters(gender = listOf("men")))
        val menPolo = total(CustomWearFilters(gender = listOf("men"), productType = listOf("polo")))
        val menOrWomen = total(CustomWearFilters(gender = listOf("men", "women")))
        assertEquals(catalogue.size, all)
        assertEquals(3, men)
        assertEquals(2, menPolo)
        assertTrue(menOrWomen > men)
    }

    @Test
    fun `returns nothing for an impossible combination`() {
        val result = CustomWearQuery.query(catalogue, CustomWearFilters(gender = listOf("men"), productType = listOf("hoodie"), color = listOf("pink")))
        assertEquals(0, result.total)
        assertEquals(emptyList(), result.products)
    }

    @Test
    fun `sorts by price in both directions`() {
        val asc = CustomWearQuery.query(catalogue, CustomWearFilters(sort = "price-asc")).products
        val desc = CustomWearQuery.query(catalogue, CustomWearFilters(sort = "price-desc")).products
        assertTrue(asc.first().basePricePaise <= asc.last().basePricePaise)
        assertEquals(asc.last().basePricePaise, desc.first().basePricePaise)
        assertEquals("Studio Hoodie", CustomWearQuery.query(catalogue, CustomWearFilters(sort = "newest")).products.first().name)
        assertEquals("Studio Hoodie", CustomWearQuery.query(catalogue, CustomWearFilters(sort = "recommended")).products.first().name)
    }

    @Test
    fun `searches name, SKU, fabric and colour names`() {
        assertEquals(1, total(CustomWearFilters(search = "TL-MP-220-CLS")))
        assertTrue(total(CustomWearFilters(search = "hoodie")) > 0)
        assertEquals(1, total(CustomWearFilters(search = "dry-fit")))
        assertEquals(1, total(CustomWearFilters(search = "Navy")))
        assertEquals(0, total(CustomWearFilters(search = "zzzz")))
    }

    @Test
    fun `paginates without losing or repeating products, and clamps the page`() {
        val one = CustomWearQuery.query(catalogue, CustomWearFilters(), pageSize = 4)
        val two = CustomWearQuery.query(catalogue, CustomWearFilters(page = 2), pageSize = 4)
        assertEquals(4, one.products.size)
        assertEquals(2, one.pageCount)
        assertEquals(emptyList(), one.products.filter { p -> two.products.any { it.id == p.id } })
        assertEquals(catalogue.size, (one.products + two.products).size)
        assertEquals(1, CustomWearQuery.query(catalogue, CustomWearFilters(page = 999)).page)
        assertEquals(PriceBounds(28_000, 99_000), one.priceBounds)
    }

    @Test
    fun `a category listing also holds unisex products of its type`() {
        val names = CustomWearQuery.query(catalogue, CustomWearFilters(category = "womens-round-neck")).products.map { it.name }
        assertEquals(listOf("Team Tee"), names)
        assertEquals(2, total(CustomWearFilters(category = "mens-polo")))
        // An unknown category id filters nothing, as on the web.
        assertEquals(catalogue.size, total(CustomWearFilters(category = "mens-blazers")))
    }

    @Test
    fun `bucket filters - gsm, moq, supported methods only, price range`() {
        assertEquals(setOf("Studio Hoodie", "Classic Polo"), CustomWearQuery.query(catalogue, CustomWearFilters(gsm = listOf("200-240", "240-plus"))).products.map { it.name }.toSet())
        assertEquals(4, total(CustomWearFilters(moq = listOf("no-moq"))))
        assertEquals(5, total(CustomWearFilters(moq = listOf("25-plus"))))
        assertEquals(1, total(CustomWearFilters(method = listOf("dtg"))))
        assertEquals(0, total(CustomWearFilters(method = listOf("embroidery"))))
        assertEquals(3, total(CustomWearFilters(minPricePaise = 45_000, maxPricePaise = 52_000)))
        assertEquals(1, total(CustomWearFilters(size = listOf("5-6Y"))))
    }

    @Test
    fun `related products rank type, gender and category, explicit ids first`() {
        val polo = catalogue.first()
        val kids = catalogue.last()
        val related = CustomWearQuery.related(polo.copy(relatedProductIds = listOf(kids.id)), catalogue, 3)
        assertEquals(listOf("Kids Polo", "Sport Polo", "Everyday Polo"), related.map { it.name })
        assertTrue(related.none { it.id == polo.id })
    }

    @Test
    fun `there are fifteen categories with the web's ids`() {
        assertEquals(15, CustomWearTaxonomy.CATEGORIES.size)
        assertEquals("Customize Men's Polo T-Shirts", CustomWearTaxonomy.category("mens-polo")!!.fullLabel)
        assertEquals("hoodie", CustomWearTaxonomy.category("kids-hoodies")!!.productType)
        assertEquals("sportswear", CustomWearTaxonomy.category("womens-sports-wear")!!.productType)
    }

    @Test
    fun `product writes are validated against the taxonomy`() {
        val good = CustomWearProductRequest(
            name = "Classic Polo", sku = "TL-1", gender = "men", category = "mens-polo", productType = "polo", basePricePaise = 45_000,
            priceTiers = listOf(PriceTier(1, 49, 45_000), PriceTier(50, null, 39_000)),
        )
        assertEquals(emptyList(), CustomWearProductRules.validate(good))
        assertEquals(45_000, CustomWearProductRules.maxPrice(good))
        val bad = good.copy(
            gender = "alien", category = "mens-hoodies", fabric = "silk",
            priceTiers = listOf(PriceTier(1, 60, 45_000), PriceTier(50, null, 39_000)),
            customizationMethods = listOf(CustomizationMethodOption("laser", true)), badges = listOf("hot"),
        )
        val errors = CustomWearProductRules.validate(bad)
        assertTrue(errors.any { it.startsWith("gender must be") }, errors.toString())
        assertTrue("category mens-hoodies is for hoodie products" in errors, errors.toString())
        assertTrue(errors.any { it.startsWith("fabric must be") })
        assertTrue("priceTiers must not overlap" in errors)
        assertTrue(errors.any { it.startsWith("customizationMethods[].id") })
        assertTrue(errors.any { it.startsWith("badges must be") })
    }
}
