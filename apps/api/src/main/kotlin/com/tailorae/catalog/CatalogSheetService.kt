package com.tailorae.catalog

import com.tailorae.catalog.rules.CatalogCsv
import com.tailorae.catalog.rules.Catalogue
import com.tailorae.catalog.rules.ColourFamilySync
import com.tailorae.catalog.rules.ImportRow
import com.tailorae.catalog.rules.MyntraExport
import com.tailorae.catalog.rules.NormalisedProduct
import com.tailorae.catalog.rules.ProductSpec
import com.tailorae.catalog.rules.SheetColumns
import com.tailorae.catalog.rules.SheetImport
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Outbox
import com.tailorae.common.Slugs
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/** One uploaded sheet, as the controller hands it over. */
data class SheetFile(val filename: String, val bytes: ByteArray)

/**
 * Bulk catalogue work for staff: the CSV round trip (export, edit stock in a
 * spreadsheet, import) and Myntra SKU templates in both directions.
 *
 * A Myntra import is always two steps: `review` reads the sheets and reports
 * every product, size and assumption without writing; `commit` takes the
 * reviewed list back (as edited in the browser) and writes it, one product
 * per transaction so one bad row never sinks the other 399. Imports belong to
 * the platform shop unless a seller is named.
 */
@Service
class CatalogSheetService(
    private val jdbc: JdbcClient,
    private val json: JsonMapper,
    private val repo: ProductRepository,
    private val categories: CategoryService,
    private val outbox: Outbox,
    private val audit: Audit,
    transactions: PlatformTransactionManager,
) {
    private val perProduct = TransactionTemplate(transactions).apply { propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW }

    // ================================================================ CSV

    @Transactional
    fun csvImport(adminId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val csv = body["csv"] as? String
        if (csv.isNullOrBlank()) throw BadRequestException("Paste or upload a CSV first")
        val commit = body["commit"] == true
        val createCategories = body["createCategories"] == true
        val sellerId = sellerOf(body)
        val parsed = CatalogCsv.parseCatalogCsv(csv)
        if (parsed.products.isEmpty()) {
            throw BadRequestException(parsed.errors.firstOrNull()?.message ?: "Nothing in that file could be read as a product")
        }
        val errors = parsed.errors.toMutableList()
        val categoryIds = categoryIndex()
        val brandIds = brandIndex()
        val existing = parsed.products.associate { p -> p.sku.lowercase() to existingProduct(sellerId, p.sku) }

        val missingCategories = linkedSetOf<String>()
        data class Planned(val product: com.tailorae.catalog.rules.ParsedProduct, val existingId: UUID?, val categoryId: String?)
        val plan = mutableListOf<Planned>()
        for (p in parsed.products) {
            val current = existing[p.sku.lowercase()]
            val categoryId = p.category?.let { categoryIds[it.trim().lowercase()] }
            if (p.category != null && categoryId == null && !createCategories) missingCategories += p.category!!
            if (current == null && p.category == null) {
                errors += com.tailorae.catalog.rules.RowError(p.rows.first(), "${p.sku}: a new product needs a category"); continue
            }
            if (current == null && p.category != null && categoryId == null && !createCategories) continue
            plan += Planned(p, current, categoryId)
        }
        val summary = linkedMapOf(
            "creating" to plan.count { it.existingId == null }, "updating" to plan.count { it.existingId != null },
            "variants" to plan.sumOf { it.product.variants.size }, "rows" to parsed.products.sumOf { it.rows.size },
            "errors" to errors.size, "missingCategories" to missingCategories.toList(), "ignoredColumns" to parsed.ignoredColumns,
            "knownColumns" to CatalogCsv.KNOWN_COLUMNS,
        )
        if (!commit) {
            return mapOf("dryRun" to true, "summary" to summary, "errors" to errors,
                "preview" to plan.take(25).map { mapOf("sku" to it.product.sku, "name" to it.product.name,
                    "action" to if (it.existingId == null) "create" else "update", "variants" to it.product.variants.size) })
        }
        if (missingCategories.isNotEmpty()) {
            throw BadRequestException("Unknown categor${if (missingCategories.size == 1) "y" else "ies"}: ${missingCategories.joinToString(", ")}")
        }
        var created = 0
        var updated = 0
        var variants = 0
        for (entry in plan) {
            val p = entry.product
            val categoryId = entry.categoryId ?: p.category?.let { resolveCategory(it, categoryIds) }
            val fields = linkedMapOf<String, Any?>()
            fun set(k: String, v: Any?) { if (v != null) fields[k] = v }
            set("name", p.name); set("description", p.description); set("shortDescription", p.shortDescription)
            set("material", p.material); set("status", p.status); set("pricePaise", p.pricePaise); set("mrpPaise", p.mrpPaise)
            set("costPaise", p.costPaise); set("quantity", p.quantity); set("weightGrams", p.weightGrams); set("sizeGuide", p.sizeGuide)
            set("metaTitle", p.metaTitle); set("metaDescription", p.metaDescription); set("categoryId", categoryId)
            p.brand?.let { brandIds[it.trim().lowercase()] }?.let { set("brandId", it) }
            ColourFamilySync.product(fields)
            val productId = if (entry.existingId != null) {
                repo.updateProduct(entry.existingId, fields); updated++; entry.existingId
            } else {
                fields["sku"] = p.sku
                fields["slug"] = Slugs.unique(p.slug ?: p.name) { repo.slugTaken(it) }
                fields.putIfAbsent("status", "DRAFT")
                fields["moderationStatus"] = "APPROVED"
                created++
                repo.insertProduct(sellerId, fields)
            }
            for (v in p.variants) {
                val data = linkedMapOf<String, Any?>(
                    "name" to (listOfNotNull(v.color, v.size).joinToString(" - ").ifEmpty { p.name }),
                    "color" to v.color, "size" to v.size, "quantity" to v.quantity, "pricePaise" to v.pricePaise,
                )
                ColourFamilySync.variant(data)
                upsertVariant(sellerId, productId, v.sku, data)
                variants++
            }
            announce(productId, if (entry.existingId == null) ProductChange.CREATED else ProductChange.UPDATED)
        }
        audit.record("admin", adminId, "IMPORT", "product", null, after = mapOf("created" to created, "updated" to updated, "sellerId" to sellerId))
        return mapOf("created" to created, "updated" to updated, "variants" to variants, "failures" to emptyList<Any>(), "errors" to errors, "summary" to summary)
    }

    @Transactional(readOnly = true)
    fun csvExport(sellerId: String?): String {
        val seller = sellerId?.let { if (it == "house") PlatformSeller.ID else runCatching { UUID.fromString(it) }.getOrNull() }
        val rows = jdbc.sql(
            """
            select p.*, c.name as category_name, b.name as brand_name from product p
            join category c on c.id = p.category_id left join brand b on b.id = p.brand_id
            ${if (seller != null) "where p.seller_id = :s" else ""} order by p.name
            """.trimIndent(),
        ).apply { if (seller != null) param("s", seller) }
            .query { rs, _ -> repo.productRow(rs).apply { put("categoryName", rs.getString("category_name")); put("brandName", rs.getString("brand_name")) } }.list()
        val variants = repo.variantsFor(rows.map { UUID.fromString(it["id"] as String) })
        val header = listOf("sku", "name", "slug", "category", "brand", "price", "originalPrice", "costPrice", "quantity", "status",
            "material", "weight", "shortDescription", "description", "color", "size", "variantSku", "variantQuantity", "variantPrice")
        val out = mutableListOf<List<Any?>>()
        for (p in rows) {
            val base = listOf(p["sku"], p["name"], p["slug"], p["categoryName"] ?: "", p["brandName"] ?: "", rupees(p["pricePaise"]),
                rupees(p["mrpPaise"]) ?: "", rupees(p["costPaise"]) ?: "", p["quantity"], p["status"], p["material"] ?: "",
                p["weightGrams"] ?: "", p["shortDescription"] ?: "", p["description"] ?: "")
            val vs = variants[p["id"]] ?: emptyList()
            if (vs.isEmpty()) out += base + listOf("", "", "", "", "")
            else vs.forEach { v -> out += base + listOf(v["color"] ?: "", v["size"] ?: "", v["sku"], v["quantity"], rupees(v["pricePaise"]) ?: "") }
        }
        // A BOM so Excel opens rupee symbols and accented names as UTF-8.
        return "﻿" + CatalogCsv.toCsv(header, out)
    }

    /** The CSV speaks rupees, the way a seller's spreadsheet does; the importer reads them back to paise. */
    private fun rupees(paise: Any?): Any? = (paise as Number?)?.toLong()?.let { if (it % 100 == 0L) it / 100 else it / 100.0 }

    // ================================================================ Myntra export

    @Transactional(readOnly = true)
    fun myntraCounts(ids: String?, sellerId: String?): Map<String, Long> {
        val (where, params) = scopeWhere(ids, sellerId)
        return jdbc.sql("select p.article_type, count(*) from product p where p.article_type is not null $where group by p.article_type")
            .params(params).query { rs, _ -> rs.getString(1) to rs.getLong(2) }.list().toMap()
    }

    data class Export(val bytes: ByteArray, val filename: String, val rows: Int, val skipped: List<String>)

    @Transactional(readOnly = true)
    fun myntraExport(articleType: String?, ids: String?, sellerId: String?, assetBase: String): Export {
        val spec = Catalogue.find(articleType) ?: throw BadRequestException("Choose an article type to export")
        if (spec.template.isNullOrBlank()) throw BadRequestException("Only the Myntra apparel article types can be exported as a template")
        val (where, params) = scopeWhere(ids, sellerId)
        val products = jdbc.sql("select p.* from product p where p.article_type = :type $where order by p.sku limit 5000")
            .params(params + mapOf("type" to spec.articleType)).query { rs, _ -> repo.productRow(rs) }.list()
        if (products.isEmpty()) throw NotFoundException("No ${spec.articleType} listings match")
        val variants = repo.variantsFor(products.map { UUID.fromString(it["id"] as String) })
        val brandNames = jdbc.sql("select id, name from brand").query { rs, _ -> rs.getString(1) to rs.getString(2) }.list().toMap()
        // Myntra has one article number and one set of photos per colour: a listing holding several is left out and named.
        val colourCount = { p: Map<String, Any?> -> (variants[p["id"]] ?: emptyList()).mapNotNull { (it["color"] as String?)?.trim()?.lowercase()?.ifEmpty { null } }.toSet().size }
        val mixed = products.filter { colourCount(it) > 1 }
        val exportable = products.filter { colourCount(it) <= 1 }
        if (exportable.isEmpty()) {
            throw ConflictException("Nothing to export: ${mixed.joinToString(", ") { it["sku"] as String }} hold${if (mixed.size == 1) "s" else ""} several colours in one listing. Myntra needs one listing per colour — use “Add another colour”.")
        }
        val maps = exportable.map { p ->
            p + mapOf("brand" to (p["brandId"] as String?)?.let { mapOf("name" to brandNames[it]) },
                "variants" to (variants[p["id"]] ?: emptyList()).sortedWith(compareBy({ it["createdAt"] as java.time.Instant }, { it["sku"] as String })))
        }
        val (bytes, rows) = MyntraExport.buildWorkbook(spec, maps, assetBase)
        return Export(bytes, "myntra-${spec.slug}-${java.time.LocalDate.now()}.xlsx", rows, mixed.map { it["sku"] as String })
    }

    private fun scopeWhere(ids: String?, sellerId: String?): Pair<String, Map<String, Any?>> {
        val clauses = StringBuilder()
        val params = linkedMapOf<String, Any?>()
        ids?.split(",")?.mapNotNull { runCatching { UUID.fromString(it.trim()) }.getOrNull() }?.takeIf { it.isNotEmpty() }?.let {
            clauses.append(" and p.id = any(cast(:ids as uuid[]))"); params["ids"] = it.take(2000).map(UUID::toString).toTypedArray()
        }
        when {
            sellerId.isNullOrBlank() -> {}
            sellerId == "house" -> { clauses.append(" and p.seller_id = :seller"); params["seller"] = PlatformSeller.ID }
            else -> runCatching { UUID.fromString(sellerId) }.getOrNull()?.let { clauses.append(" and p.seller_id = :seller"); params["seller"] = it }
        }
        return clauses.toString() to params
    }

    // ================================================================ Myntra / any-sheet import

    @Transactional(readOnly = true)
    fun review(files: List<SheetFile>, overridesJson: String?, sellerId: String?): Map<String, Any?> {
        if (files.isEmpty()) throw BadRequestException("Choose at least one sheet")
        files.firstOrNull { !Regex("\\.(xlsx|xlsm|csv)$", RegexOption.IGNORE_CASE).containsMatchIn(it.filename) }?.let {
            throw BadRequestException("Only .xlsx and .csv files can be imported")
        }
        val overrides: Map<String, String> = if (overridesJson.isNullOrBlank()) emptyMap() else runCatching {
            json.readValue(overridesJson, Map::class.java).entries.associate { it.key.toString() to it.value.toString() }
        }.getOrElse { throw BadRequestException("Column mapping could not be read") }
        val seller = sellerOf(mapOf("sellerId" to sellerId))

        val rows = mutableListOf<ImportRow>()
        val sheets = mutableListOf<Map<String, Any?>>()
        for (file in files) {
            val parsed = runCatching { SheetImport.parseSheet(file.bytes, file.filename, overrides) }
                .getOrElse { throw BadRequestException("${file.filename} could not be read as a spreadsheet") }
            sheets += mapOf("file" to parsed.file, "sheet" to parsed.sheet, "rows" to parsed.rows.size, "unmapped" to parsed.unmapped, "articleType" to parsed.articleType)
            rows += parsed.rows
        }
        if (rows.isEmpty()) {
            throw BadRequestException("No product rows were found. The header could not be identified — map a few columns and try again.")
        }
        val products = SheetImport.normaliseRows(rows)
        val categoryNames = categoryIndex().keys
        val brandNames = brandIndex().keys
        val reviewed = products.map { p ->
            val existingId = existingProduct(seller, p.articleNumber) ?: p.variants.firstNotNullOfOrNull { existingByVariant(seller, it.sku) }
            json.convertValue(p, Map::class.java).entries.associate { it.key.toString() to it.value } + mapOf(
                "action" to if (existingId != null) "update" else "create",
                "existingId" to existingId?.toString(),
                "newCategory" to (p.category != null && p.category.trim().lowercase() !in categoryNames),
                "newBrand" to (p.brand != null && p.brand.trim().lowercase() !in brandNames),
                "sizeChart" to SheetImport.sizeChartFrom(p.variants),
                "missingForLive" to SheetImport.missingForLiveOf(p),
            )
        }
        val rejected = rows.filter { it.issues.isNotEmpty() }
        return mapOf(
            "sheets" to sheets,
            "products" to reviewed,
            "rejectedRows" to rejected.map { mapOf("row" to it.rowNumber, "sheet" to it.sheet, "file" to it.file, "issues" to it.issues) },
            "fields" to SheetColumns.CANONICAL_FIELDS,
            "summary" to mapOf(
                "products" to reviewed.size, "variants" to products.sumOf { it.variants.size },
                "creating" to reviewed.count { it["action"] == "create" }, "updating" to reviewed.count { it["action"] == "update" },
                "newCategories" to reviewed.filter { it["newCategory"] == true }.mapNotNull { it["category"] }.distinct(),
                "newBrands" to reviewed.filter { it["newBrand"] == true }.mapNotNull { it["brand"] }.distinct(),
                "warnings" to products.sumOf { it.issues.size }, "rejectedRows" to rejected.size,
                "incomplete" to reviewed.count { (it["missingForLive"] as List<*>).isNotEmpty() },
            ),
        )
    }

    /** Not transactional itself: each product commits on its own (see [perProduct]). */
    fun commit(adminId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val raw = (body["products"] as? List<*>)?.filterIsInstance<Map<*, *>>() ?: emptyList()
        if (raw.isEmpty()) throw BadRequestException("Nothing to import")
        val sellerId = perProduct.execute { sellerOf(body) }!!
        val publish = body["publish"] == true
        val categoryIds = perProduct.execute { categoryIndex() }!!.toMutableMap()
        val brandIds = perProduct.execute { brandIndex() }!!.toMutableMap()

        var created = 0
        var updated = 0
        var variantsWritten = 0
        val createdCategories = linkedSetOf<String>()
        val failures = mutableListOf<Map<String, String>>()
        val incomplete = mutableListOf<Map<String, Any?>>()

        for (item in raw) {
            if (item["skip"] == true) continue
            val product = runCatching { json.convertValue(item, NormalisedProduct::class.java) }.getOrElse {
                failures += mapOf("sku" to (item["articleNumber"]?.toString() ?: "?"), "message" to "This product could not be read"); null
            } ?: continue
            if (product.category.isNullOrBlank()) { failures += mapOf("sku" to product.articleNumber, "message" to "No category chosen"); continue }
            val existingId = (item["existingId"] as? String)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            try {
                perProduct.executeWithoutResult {
                    val before = categoryIds.size
                    val categoryId = resolveCategory(product.category, categoryIds)
                    if (categoryIds.size > before) createdCategories += SheetImport.titleCase(product.category)
                    val brandId = product.brand?.takeIf { it.isNotBlank() }?.let { resolveBrand(it, brandIds) }
                    val outcome = commitOne(adminId, sellerId, product, existingId, item["sizeChart"] as? String, categoryId, brandId, publish)
                    if (outcome.created) created++ else updated++
                    variantsWritten += outcome.variants
                    if (outcome.missing.isNotEmpty()) incomplete += mapOf("sku" to product.articleNumber, "missing" to outcome.missing)
                }
            } catch (e: Exception) {
                failures += mapOf("sku" to product.articleNumber, "message" to when (e) {
                    is org.springframework.dao.DuplicateKeyException -> "A product or SKU with this code already exists"
                    is com.tailorae.common.ApiException -> e.message ?: "Could not be saved"
                    else -> "Could not be saved"
                })
            }
        }
        perProduct.executeWithoutResult {
            audit.record("admin", adminId, "IMPORT", "product", null, after = mapOf("created" to created, "updated" to updated, "sellerId" to sellerId))
        }
        return mapOf("created" to created, "updated" to updated, "variants" to variantsWritten,
            "createdCategories" to createdCategories.toList(), "failures" to failures, "incomplete" to incomplete)
    }

    private data class Outcome(val created: Boolean, val variants: Int, val missing: List<String>)

    private fun commitOne(
        adminId: UUID, sellerId: UUID, product: NormalisedProduct, existingId: UUID?, sizeChart: String?,
        categoryId: String, brandId: String?, publish: Boolean,
    ): Outcome {
        // Re-checked rather than trusted: the review payload round-trips through the browser.
        val articleType = product.articleType
        val listing = SheetImport.sanitiseListing(articleType, product.listing, if (articleType != null) product.attributes else emptyMap())
        val variants = product.variants.map { v ->
            val clean = SheetImport.sanitiseVariantListing(v.standardSize, v.sizeOnLabel, v.gtin, v.measurementValues)
            v.copy(standardSize = clean.standardSize, sizeOnLabel = clean.sizeOnLabel, gtin = clean.gtin, measurementValues = clean.measurementValues)
        }
        val angles = SheetImport.IMAGE_ANGLE_ORDER.mapNotNull { a -> product.imageAngles?.get(a)?.trim()?.takeIf { it.isNotEmpty() }?.let { a to it } }.toMap()
        val images = angles.values.toList().ifEmpty { product.images }
        val extraColumns = categories.columns(categoryId)
        val missing = SheetImport.missingForLiveOf(
            product.copy(articleType = articleType, listing = listing.product, attributes = if (articleType != null) listing.attributes else product.attributes,
                imageAngles = angles, variants = variants), extraColumns,
        )
        val name = if (articleType != null) product.name else product.displayName ?: product.name
        val description = if (articleType != null) product.description.orEmpty() else
            listOfNotNull(product.description, product.attributes.entries.joinToString("\n") { "${it.key}: ${it.value}" }.ifEmpty { null }).joinToString("\n\n")
        val fields = linkedMapOf<String, Any?>(
            "name" to name, "shortDescription" to product.shortDescription, "description" to description.ifEmpty { null },
            "pricePaise" to product.pricePaise, "mrpPaise" to product.mrpPaise?.takeIf { it > product.pricePaise },
            "material" to (product.material ?: listing.attributes["fabric"]), "color" to product.colorName,
            "sizeGuide" to (sizeChart?.ifEmpty { null } ?: SheetImport.sizeChartFrom(variants).ifEmpty { null }),
            "metaTitle" to product.metaTitle, "metaDescription" to product.metaDescription, "metaKeywords" to product.searchKeywords,
            "categoryId" to categoryId, "brandId" to brandId, "images" to images, "thumbnail" to (angles["front"] ?: images.firstOrNull()),
            "quantity" to variants.sumOf { it.stock },
        )
        listing.product.forEach { (k, v) -> if (k in ProductColumns.BY_NAME) fields[k] = v }
        if (articleType != null) {
            fields["articleType"] = articleType
            fields["attributes"] = listing.attributes
            fields["imageAngles"] = angles.ifEmpty { null }
        }
        ColourFamilySync.product(fields)

        val owned = existingId?.takeIf { id ->
            jdbc.sql("select exists (select 1 from product where id = :id and seller_id = :s)").param("id", id).param("s", sellerId).query(Boolean::class.javaObjectType).single()
        }
        val productId: UUID
        if (owned != null) {
            repo.updateProduct(owned, fields)
            productId = owned
        } else {
            fields["sku"] = product.articleNumber
            fields["slug"] = Slugs.unique("$name ${product.colorName}") { repo.slugTaken(it) }
            fields["status"] = if (publish && missing.isEmpty()) "ACTIVE" else "DRAFT"
            fields["moderationStatus"] = "APPROVED"
            productId = repo.insertProduct(sellerId, fields)
        }
        for (v in variants) {
            val data = linkedMapOf<String, Any?>(
                "name" to "${product.colorName} - ${v.size}", "color" to product.colorName, "size" to v.size,
                "quantity" to v.stock, "pricePaise" to v.pricePaise,
            )
            // A re-import fills in what the sheet carries and never blanks what was added since.
            v.standardSize?.let { data["standardSize"] = it }
            v.sizeOnLabel?.let { data["sizeOnLabel"] = it }
            v.gtin?.let { data["gtin"] = it }
            v.measurementValues?.let { values ->
                val stored = jdbc.sql("select measurements::text from product_variant where seller_id = :s and lower(sku) = lower(:sku)")
                    .param("s", sellerId).param("sku", v.sku).query(String::class.java).optional().orElse(null)
                    ?.let { runCatching { json.readValue(it, Map::class.java) }.getOrNull() } ?: emptyMap<Any?, Any?>()
                data["measurements"] = stored.entries.associate { it.key.toString() to it.value } + values
            }
            ColourFamilySync.variant(data)
            upsertVariant(sellerId, productId, v.sku, data)
        }
        val stored = repo.product(productId)!!.apply { put("variants", repo.variants(productId)) }
        val stillMissing = if (articleType != null) ProductSpec.missingForLive(stored, extraColumns) else missing
        announce(productId, if (owned != null) ProductChange.UPDATED else ProductChange.CREATED)
        return Outcome(owned == null, variants.size, stillMissing.map { it.label })
    }

    // ================================================================ helpers

    private fun sellerOf(body: Map<String, Any?>): UUID {
        val raw = (body["sellerId"] ?: body["vendorId"]) as? String
        if (raw.isNullOrBlank() || raw == "house") return PlatformSeller.ID
        val id = runCatching { UUID.fromString(raw) }.getOrNull() ?: throw BadRequestException("That seller does not exist")
        val exists = jdbc.sql("select exists (select 1 from seller where id = :id)").param("id", id).query(Boolean::class.javaObjectType).single()
        if (!exists) throw BadRequestException("That seller does not exist")
        return id
    }

    private fun existingProduct(sellerId: UUID, sku: String): UUID? =
        jdbc.sql("select id from product where seller_id = :s and lower(sku) = lower(:sku)").param("s", sellerId).param("sku", sku.trim())
            .query(UUID::class.java).optional().orElse(null)

    private fun existingByVariant(sellerId: UUID, sku: String): UUID? =
        jdbc.sql("select product_id from product_variant where seller_id = :s and lower(sku) = lower(:sku)").param("s", sellerId).param("sku", sku.trim())
            .query(UUID::class.java).optional().orElse(null)

    private fun categoryIndex(): MutableMap<String, String> =
        jdbc.sql("select id, name, slug from category").query { rs, _ -> Triple(rs.getString(1), rs.getString(2), rs.getString(3)) }.list()
            .flatMap { (id, name, slug) -> listOf(name.lowercase() to id, slug.lowercase() to id) }.toMap().toMutableMap()

    private fun brandIndex(): MutableMap<String, String> =
        jdbc.sql("select id, name, slug from brand").query { rs, _ -> Triple(rs.getString(1), rs.getString(2), rs.getString(3)) }.list()
            .flatMap { (id, name, slug) -> listOf(name.lowercase() to id, slug.lowercase() to id) }.toMap().toMutableMap()

    /** Named by the sheet and created when new: a new kind of garment should not need an admin to make a category first. */
    private fun resolveCategory(name: String, index: MutableMap<String, String>): String {
        index[name.trim().lowercase()]?.let { return it }
        val slug = CatalogCsv.slugify(name)
        val id = jdbc.sql("select id::text from category where slug = :s").param("s", slug).query(String::class.java).optional().orElse(null)
            ?: Ids.newId().also { newId ->
                jdbc.sql("insert into category (id, name, slug) values (:id, :n, :s)").param("id", newId).param("n", SheetImport.titleCase(name)).param("s", slug).update()
            }.toString()
        index[name.trim().lowercase()] = id
        return id
    }

    private fun resolveBrand(name: String, index: MutableMap<String, String>): String {
        index[name.trim().lowercase()]?.let { return it }
        val slug = CatalogCsv.slugify(name)
        val id = jdbc.sql("select id::text from brand where slug = :s or lower(name) = lower(:n)").param("s", slug).param("n", name.trim())
            .query(String::class.java).list().firstOrNull()
            ?: Ids.newId().also { newId ->
                jdbc.sql("insert into brand (id, name, slug, status, is_active) values (:id, :n, :s, 'APPROVED', true)")
                    .param("id", newId).param("n", name.trim()).param("s", slug).update()
            }.toString()
        index[name.trim().lowercase()] = id
        return id
    }

    private fun upsertVariant(sellerId: UUID, productId: UUID, sku: String, data: MutableMap<String, Any?>) {
        val existing = jdbc.sql("select id from product_variant where seller_id = :s and lower(sku) = lower(:sku)").param("s", sellerId).param("sku", sku)
            .query(UUID::class.java).optional().orElse(null)
        if (existing != null) {
            repo.updateVariant(existing, data)
            jdbc.sql("update product_variant set product_id = :p where id = :id").param("p", productId).param("id", existing).update()
        } else {
            repo.insertVariant(productId, sellerId, data + mapOf("sku" to sku.trim().uppercase()))
        }
    }

    private fun announce(id: UUID, change: ProductChange) {
        jdbc.sql("select seller_id, slug, status, moderation_status from product where id = :id").param("id", id)
            .query { rs, _ -> ProductChanged(id, rs.getObject("seller_id", UUID::class.java), rs.getString("slug"), change, rs.getString("status"), rs.getString("moderation_status")) }
            .optional().ifPresent { outbox.record(CatalogTopics.PRODUCT_CHANGED, id.toString(), it) }
    }
}
