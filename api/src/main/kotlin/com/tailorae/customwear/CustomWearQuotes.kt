package com.tailorae.customwear

import com.tailorae.common.ApiException
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Outbox
import com.tailorae.common.storage.Bucket
import com.tailorae.common.storage.ObjectStorage
import com.tailorae.content.ImageProbe
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.security.MessageDigest
import java.sql.ResultSet
import java.time.Instant
import java.util.HexFormat
import java.util.UUID

/** Validation failures on the public quote form: 422 with every problem listed. */
class QuoteValidationException(val errors: List<String>) :
    ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Some details are missing or invalid. Please check the form and try again.")

data class ArtworkView(
    val id: UUID,
    /** The reference to send back in a quote's `designFiles`. Not a fetchable URL: artwork is private. */
    val url: String,
    val reference: String,
    val name: String,
    val format: String,
    val bytes: Long,
    val width: Int?,
    val height: Int?,
    /** Always false: SVG is refused rather than rasterised. Kept for the web's `UploadedArtwork` shape. */
    val rasterised: Boolean = false,
)

/** What a customer sees of their own quote — never the internal notes. */
data class PublicQuoteView(
    val reference: String,
    val status: String,
    val productName: String,
    val productSlug: String,
    val sku: String,
    val colorName: String?,
    val sizes: List<String>,
    val quantity: Int,
    val method: String?,
    val locations: List<String>,
    val designFiles: List<String>,
    val quotedPricePaise: Long?,
    val requiredBy: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

/** Staff view of an artwork file: a short-lived signed link to the private object. */
data class StaffArtworkView(val reference: String, val name: String, val format: String, val bytes: Long, val width: Int?, val height: Int?, val url: String)

data class QuoteCustomerView(val id: UUID, val email: String, val firstName: String, val lastName: String)

data class AdminQuoteView(
    val id: UUID,
    val reference: String,
    val userId: UUID?,
    val productId: UUID?,
    val productSlug: String,
    val productName: String,
    val sku: String,
    val colorName: String?,
    val sizes: List<String>,
    val quantity: Int,
    val method: String?,
    val locations: List<String>,
    /** Signed links to the artwork (they expire in minutes; reload the quote for fresh ones). */
    val designFiles: List<String>,
    val artwork: List<StaffArtworkView>,
    val notes: String?,
    val customerName: String,
    val company: String?,
    val email: String,
    val phone: String?,
    val country: String,
    val postcode: String?,
    val requiredBy: String?,
    val status: String,
    val quotedPricePaise: Long?,
    val adminNotes: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val user: QuoteCustomerView? = null,
)

data class QuoteCreated(
    val reference: String,
    val references: List<String>,
    val persisted: Boolean,
    val receivedAt: Instant,
    val quotes: List<PublicQuoteView>,
)

data class QuotePagination(val page: Int, val limit: Int, val total: Long, val pages: Int)

data class AdminQuoteList(val quotes: List<AdminQuoteView>, val counts: Map<String, Long>, val pagination: QuotePagination)

/** Event payload for `custom-wear.quote.requested` (notification sends the acknowledgement and staff alert). */
data class QuoteRequested(
    val customerName: String,
    val company: String?,
    val email: String,
    val phone: String?,
    val country: String,
    val postcode: String?,
    val requiredBy: String?,
    val quotes: List<QuoteRequestedLine>,
    val artworkCount: Int,
)

data class QuoteRequestedLine(val reference: String, val productName: String, val sku: String, val quantity: Int, val colorName: String?, val sizes: List<String>)

/**
 * Print artwork, ported from legacy `storeArtwork`. Identified by its bytes,
 * stored in the PRIVATE bucket under a content-hash name, deduplicated.
 *
 * Differences from legacy: files are kept as uploaded (no re-encode / EXIF
 * strip — the bucket is private and staff-only), and SVG is refused instead of
 * rasterised, because there is no SVG rasteriser on the JVM side.
 */
@Service
class ArtworkStore(private val jdbc: JdbcClient, private val storage: ObjectStorage) {

    @Transactional
    fun store(originalName: String, bytes: ByteArray): ArtworkView {
        if (bytes.isEmpty()) throw BadRequestException("That file is empty.")
        if (bytes.size > MAX_BYTES) throw ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Artwork must be 15 MB or smaller.")
        val (format, type, size) = when {
            ImageProbe.isPdf(bytes) -> Triple("pdf", "application/pdf", null)
            ImageProbe.looksLikeSvg(bytes) -> throw BadRequestException("SVG artwork is not accepted. Export it as PNG or PDF and try again.")
            else -> {
                val image = ImageProbe.probe(bytes)?.takeIf { it.format in setOf("png", "jpeg", "webp") }
                    ?: throw BadRequestException("That file is not artwork we can read. Upload PNG, JPG, WebP or PDF.")
                Triple(image.extension, image.contentType, image)
            }
        }
        val hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
        val name = originalName.replace(Regex("[\\\\/]"), "_").take(160).ifBlank { "artwork" }
        find(hash)?.let { return it.copy(name = name) }

        val stored = storage.put(Bucket.PRIVATE, "custom-wear/artwork", "${hash.take(32)}.$format", type, bytes)
        val inserted = jdbc.sql(
            """
            insert into custom_wear_artwork (id, hash, storage_key, format, content_type, bytes, width, height, original_name)
            values (:id, :hash, :key, :format, :type, :bytes, :w, :h, :name)
            on conflict (hash) do nothing
            """.trimIndent(),
        )
            .param("id", Ids.newId()).param("hash", hash).param("key", stored.key).param("format", format)
            .param("type", type).param("bytes", bytes.size.toLong()).param("w", size?.width).param("h", size?.height)
            .param("name", name)
            .update()
        if (inserted == 0) storage.delete(Bucket.PRIVATE, stored.key)
        return find(hash)!!.copy(name = name)
    }

    /** The references among [references] that this API never issued. */
    fun unknown(references: Collection<String>): List<String> {
        if (references.isEmpty()) return emptyList()
        val ids = references.mapNotNull(::idOf)
        if (ids.isEmpty()) return references.toList()
        val known = jdbc.sql("select id from custom_wear_artwork where id in (:ids)")
            .param("ids", ids)
            .query(UUID::class.java).list().toSet()
        return references.filter { idOf(it) !in known }
    }

    /** Signed links for staff, in the order of [references]. */
    fun forStaff(references: List<String>): List<StaffArtworkView> {
        val ids = references.mapNotNull(::idOf)
        if (ids.isEmpty()) return emptyList()
        val rows = jdbc.sql("select * from custom_wear_artwork where id in (:ids)").param("ids", ids)
            .query { rs, _ -> rs.getObject("id", UUID::class.java) to rs.toStaff() }.list().toMap()
        return ids.mapNotNull { rows[it] }
    }

    private fun ResultSet.toStaff() = StaffArtworkView(
        reference = reference(getObject("id", UUID::class.java), getString("format")),
        name = getString("original_name"),
        format = getString("format"),
        bytes = getLong("bytes"),
        width = getObject("width") as Int?,
        height = getObject("height") as Int?,
        url = storage.signedUrl(getString("storage_key")),
    )

    private fun find(hash: String): ArtworkView? =
        jdbc.sql("select * from custom_wear_artwork where hash = :h").param("h", hash).query { rs, _ ->
            val id = rs.getObject("id", UUID::class.java)
            val ref = reference(id, rs.getString("format"))
            ArtworkView(id, ref, ref, rs.getString("original_name"), rs.getString("format"), rs.getLong("bytes"),
                rs.getObject("width") as Int?, rs.getObject("height") as Int?)
        }.optional().orElse(null)

    companion object {
        const val MAX_BYTES = 15 * 1024 * 1024

        fun reference(id: UUID, format: String) = "artwork/$id.$format"

        fun idOf(reference: String): UUID? =
            if (QuoteRules.ARTWORK_REFERENCE.matches(reference)) runCatching { UUID.fromString(reference.removePrefix("artwork/").substringBefore('.')) }.getOrNull()
            else null
    }
}

/**
 * Custom-wear quote requests (legacy `routes/custom-wear.ts` and
 * `admin-custom-wear.ts`). Made to order and priced by a person, so nothing here
 * takes payment: a request is worked by staff from NEW through CONTACTED and
 * QUOTED to WON or LOST.
 */
@Service
class CustomWearQuoteService(
    private val jdbc: JdbcClient,
    private val json: JsonMapper,
    private val products: CustomWearProductService,
    private val artwork: ArtworkStore,
    private val outbox: Outbox,
    private val audit: Audit,
) {

    /** One quote per item, all or none. [prefixErrors] labels errors `items[i]: …` for a batch. */
    @Transactional
    fun create(contact: QuoteContact, items: List<QuoteItem>, customerId: UUID?, prefixErrors: Boolean): QuoteCreated {
        val errors = mutableListOf<String>()
        val resolved = items.mapIndexed { index, item ->
            val label = if (prefixErrors) "items[$index]: " else ""
            val product = runCatching { UUID.fromString(item.productId) }.getOrNull()?.let(products::findActive)
            if (product == null) errors += "${label}productId does not match a custom wear product"
            if (artwork.unknown(item.designFiles).isNotEmpty()) errors += "${label}designFiles must be artwork uploaded through /api/custom-wear/artwork"
            item to product
        }
        if (errors.isNotEmpty()) throw QuoteValidationException(errors)

        val ids = resolved.map { (item, product) -> insert(contact, item, product!!, customerId) }
        val quotes = ids.map(::publicView)
        outbox.record(
            CustomWearTopics.QUOTE_REQUESTED, quotes.first().reference,
            QuoteRequested(
                contact.customerName, contact.company, contact.email, contact.phone, contact.country, contact.postcode, contact.requiredBy,
                quotes.map { QuoteRequestedLine(it.reference, it.productName, it.sku, it.quantity, it.colorName, it.sizes) },
                artworkCount = quotes.sumOf { it.designFiles.size },
            ),
        )
        return QuoteCreated(quotes.first().reference, quotes.map { it.reference }, true, quotes.first().createdAt, quotes)
    }

    /** The customer's quotes, including ones sent as a guest with the same address before signing up. */
    @Transactional(readOnly = true)
    fun mine(customerId: UUID): List<PublicQuoteView> {
        val email = jdbc.sql("select email from customer where id = :id").param("id", customerId).query(String::class.java).optional().orElse("")
        return jdbc.sql(
            """
            select * from custom_wear_quote
            where customer_id = :c or (customer_id is null and lower(email) = lower(:e))
            order by created_at desc limit 100
            """.trimIndent(),
        ).param("c", customerId).param("e", email).query { rs, _ -> publicView(rs) }.list()
    }

    /** Guest status check: "not found" whether the reference or the email is wrong, so references cannot be probed. */
    @Transactional(readOnly = true)
    fun lookup(reference: String, email: String): PublicQuoteView =
        jdbc.sql("select * from custom_wear_quote where reference = :r and lower(email) = lower(:e)")
            .param("r", reference).param("e", email)
            .query { rs, _ -> publicView(rs) }.optional()
            .orElseThrow { NotFoundException("No quote matches that reference and email.") }

    // ---------------------------------------------------------------- staff

    @Transactional(readOnly = true)
    fun adminList(status: String?, search: String?, page: Int, limit: Int): AdminQuoteList {
        val q = search?.trim()?.take(120)?.takeIf { it.isNotEmpty() }
        val st = status?.uppercase()?.takeIf { it in QuoteRules.STATUSES }
        val searchWhere = if (q != null) {
            "(reference ilike :q or email ilike :q or company ilike :q or customer_name ilike :q or product_name ilike :q)"
        } else "true"
        val where = if (st != null) "$searchWhere and status = :status" else searchWhere
        fun <T : JdbcClient.StatementSpec> T.bind(withStatus: Boolean): T = apply {
            if (q != null) param("q", "%$q%")
            if (withStatus && st != null) param("status", st)
        }
        val size = limit.coerceIn(1, 100)
        val safePage = page.coerceAtLeast(1)
        val total = jdbc.sql("select count(*) from custom_wear_quote where $where").bind(true).query(Long::class.javaObjectType).single()
        val rows = jdbc.sql("select * from custom_wear_quote where $where order by created_at desc limit :l offset :o")
            .bind(true).param("l", size).param("o", (safePage - 1) * size)
            .query { rs, _ -> adminView(rs) }.list()
        // Counts follow the search but not the status tab, so every tab shows how many it would hold.
        val grouped = jdbc.sql("select status, count(*) as n from custom_wear_quote where $searchWhere group by status")
            .bind(false).query { rs, _ -> rs.getString("status") to rs.getLong("n") }.list().toMap()
        val counts = QuoteRules.STATUSES.associateWith { grouped[it] ?: 0L } + ("ALL" to grouped.values.sum())
        return AdminQuoteList(rows, counts, QuotePagination(safePage, size, total, maxOf(1, ((total + size - 1) / size).toInt())))
    }

    /** By id or reference. */
    @Transactional(readOnly = true)
    fun adminGet(key: String): AdminQuoteView {
        val id = runCatching { UUID.fromString(key) }.getOrNull()
        val view = jdbc.sql("select * from custom_wear_quote where id = :id or reference = :ref")
            .param("id", id).param("ref", key.uppercase())
            .query { rs, _ -> adminView(rs) }.optional().orElseThrow { NotFoundException("Quote not found") }
        val user = view.userId?.let { uid ->
            jdbc.sql("select id, email, first_name, last_name from customer where id = :id").param("id", uid)
                .query { rs, _ -> QuoteCustomerView(uid, rs.getString("email"), rs.getString("first_name"), rs.getString("last_name")) }
                .optional().orElse(null)
        }
        return view.copy(user = user)
    }

    data class QuotePatch(val status: String?, val quotedPricePaise: Long?, val clearPrice: Boolean, val adminNotes: String?, val clearNotes: Boolean)

    @Transactional
    fun adminUpdate(adminId: UUID, id: UUID, patch: QuotePatch): AdminQuoteView {
        val before = jdbc.sql("select * from custom_wear_quote where id = :id for update").param("id", id)
            .query { rs, _ -> adminView(rs) }.optional().orElseThrow { NotFoundException("Quote not found") }
        jdbc.sql(
            """
            update custom_wear_quote set
                status = coalesce(:status, status),
                quoted_price_paise = case when :clearPrice then null else coalesce(:price, quoted_price_paise) end,
                admin_notes = case when :clearNotes then null else coalesce(:notes, admin_notes) end,
                updated_at = now()
            where id = :id
            """.trimIndent(),
        )
            .param("status", patch.status).param("price", patch.quotedPricePaise).param("clearPrice", patch.clearPrice)
            .param("notes", patch.adminNotes).param("clearNotes", patch.clearNotes).param("id", id)
            .update()
        val after = adminGet(id.toString())
        audit.record(
            "admin", adminId, "UPDATE", "custom_wear_quote", id.toString(),
            mapOf("status" to before.status, "quotedPricePaise" to before.quotedPricePaise, "adminNotes" to before.adminNotes),
            mapOf("status" to after.status, "quotedPricePaise" to after.quotedPricePaise, "adminNotes" to after.adminNotes),
        )
        return after
    }

    // ---------------------------------------------------------------- helpers

    /** Inserts with a fresh reference, retrying on the rare collision (a million a year leaves headroom). */
    private fun insert(contact: QuoteContact, item: QuoteItem, product: CustomWearProduct, customerId: UUID?): UUID {
        val id = Ids.newId()
        repeat(6) {
            val n = jdbc.sql(
                """
                insert into custom_wear_quote (id, reference, customer_id, product_id, product_slug, product_name, sku,
                    color_name, sizes, quantity, method, locations, design_files, notes,
                    customer_name, company, email, phone, country, postcode, required_by)
                values (:id, :ref, :customer, :product, :slug, :name, :sku,
                    :color, array(select jsonb_array_elements_text(cast(:sizes as jsonb))), :qty, :method,
                    array(select jsonb_array_elements_text(cast(:locations as jsonb))),
                    array(select jsonb_array_elements_text(cast(:files as jsonb))), :notes,
                    :customerName, :company, :email, :phone, :country, :postcode, :requiredBy)
                on conflict (reference) do nothing
                """.trimIndent(),
            )
                .param("id", id).param("ref", QuoteRules.newReference()).param("customer", customerId)
                .param("product", product.id).param("slug", product.slug).param("name", product.name).param("sku", product.sku)
                .param("color", item.colorName).param("sizes", json.writeValueAsString(item.sizes)).param("qty", item.quantity)
                .param("method", item.method).param("locations", json.writeValueAsString(item.locations))
                .param("files", json.writeValueAsString(item.designFiles)).param("notes", item.notes)
                .param("customerName", contact.customerName).param("company", contact.company).param("email", contact.email)
                .param("phone", contact.phone).param("country", contact.country).param("postcode", contact.postcode)
                .param("requiredBy", contact.requiredBy)
                .update()
            if (n == 1) return id
        }
        throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Could not issue a quote reference. Please try again.")
    }

    private fun publicView(id: UUID): PublicQuoteView =
        jdbc.sql("select * from custom_wear_quote where id = :id").param("id", id).query { rs, _ -> publicView(rs) }.single()

    private fun strings(rs: ResultSet, column: String): List<String> =
        (rs.getArray(column)?.array as? Array<*>)?.map { it.toString() } ?: emptyList()

    private fun publicView(rs: ResultSet) = PublicQuoteView(
        reference = rs.getString("reference"),
        status = rs.getString("status"),
        productName = rs.getString("product_name"),
        productSlug = rs.getString("product_slug"),
        sku = rs.getString("sku"),
        colorName = rs.getString("color_name"),
        sizes = strings(rs, "sizes"),
        quantity = rs.getInt("quantity"),
        method = rs.getString("method"),
        locations = strings(rs, "locations"),
        designFiles = strings(rs, "design_files"),
        quotedPricePaise = rs.getObject("quoted_price_paise") as Long?,
        requiredBy = rs.getString("required_by"),
        createdAt = rs.getTimestamp("created_at").toInstant(),
        updatedAt = rs.getTimestamp("updated_at").toInstant(),
    )

    private fun adminView(rs: ResultSet): AdminQuoteView {
        val files = strings(rs, "design_files")
        val art = artwork.forStaff(files)
        return AdminQuoteView(
            id = rs.getObject("id", UUID::class.java),
            reference = rs.getString("reference"),
            userId = rs.getObject("customer_id", UUID::class.java),
            productId = rs.getObject("product_id", UUID::class.java),
            productSlug = rs.getString("product_slug"),
            productName = rs.getString("product_name"),
            sku = rs.getString("sku"),
            colorName = rs.getString("color_name"),
            sizes = strings(rs, "sizes"),
            quantity = rs.getInt("quantity"),
            method = rs.getString("method"),
            locations = strings(rs, "locations"),
            designFiles = art.map { it.url },
            artwork = art,
            notes = rs.getString("notes"),
            customerName = rs.getString("customer_name"),
            company = rs.getString("company"),
            email = rs.getString("email"),
            phone = rs.getString("phone"),
            country = rs.getString("country"),
            postcode = rs.getString("postcode"),
            requiredBy = rs.getString("required_by"),
            status = rs.getString("status"),
            quotedPricePaise = rs.getObject("quoted_price_paise") as Long?,
            adminNotes = rs.getString("admin_notes"),
            createdAt = rs.getTimestamp("created_at").toInstant(),
            updatedAt = rs.getTimestamp("updated_at").toInstant(),
        )
    }
}
