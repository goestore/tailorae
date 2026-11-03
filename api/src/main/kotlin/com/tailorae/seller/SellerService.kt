package com.tailorae.seller

import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.FieldCrypto
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Outbox
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.SellerScope
import com.tailorae.common.Slugs
import com.tailorae.common.SystemSettings
import com.tailorae.common.storage.Bucket
import com.tailorae.common.storage.ObjectStorage
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.ResultSet
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

/**
 * A seller business from first draft to approval, and the team that runs it.
 *
 * Seller-realm methods take a [CurrentSeller] (resolved by [SellerContext]) and
 * enter [SellerScope] first, so row-level security backs up every query here.
 */
@Service
class SellerService(
    private val jdbc: JdbcClient,
    private val json: JsonMapper,
    private val scope: SellerScope,
    private val outbox: Outbox,
    private val audit: Audit,
    private val crypto: FieldCrypto,
    private val storage: ObjectStorage,
    private val settings: SystemSettings,
) {
    private val random = SecureRandom()

    // ================================================================ the caller's shop

    @Transactional(readOnly = true)
    fun me(accountId: UUID, current: CurrentSeller?, memberships: List<CurrentSeller>): SellerMeView {
        // Names first: once scoped, only the current shop's row is visible.
        val views = memberships.map { m -> MembershipView(m.sellerId, shopName(m.sellerId), m.role, m.status) }
        val open = settings.bool(SystemSettings.SELLER_APPLICATIONS_OPEN, true)
        current?.let { scope.enter(it.sellerId) }
        return SellerMeView(
            shop = current?.let { shop(it.sellerId) },
            role = current?.role,
            memberships = views,
            checklist = current?.let { checklist(it.sellerId) } ?: listOf("Create your business profile"),
            applicationsOpen = open,
        )
    }

    @Transactional
    fun createBusiness(accountId: UUID, req: CreateBusinessRequest): ShopView {
        if (!settings.bool(SystemSettings.SELLER_APPLICATIONS_OPEN, true)) throw ConflictException("We are not taking new sellers right now — please check back soon")
        val owns = jdbc.sql("select count(*) from seller_member where account_id = :a and role = 'OWNER'")
            .param("a", accountId).query(Long::class.javaObjectType).single()
        if (owns > 0) throw ConflictException("You already have a shop")

        val kyc = Kyc.validate(req.pan, req.gstin)
        // A draft may leave PAN empty for now; anything typed must still be valid.
        val errors = if (kyc.pan == null) kyc.errors - "PAN is required" else kyc.errors
        if (errors.isNotEmpty()) throw BadRequestException(errors.first())

        val id = Ids.newId()
        val slug = Slugs.unique(req.shopName) { candidate ->
            jdbc.sql("select exists (select 1 from seller where shop_slug = :s)").param("s", candidate).query(Boolean::class.javaObjectType).single()
        }
        jdbc.sql(
            """
            insert into seller (id, shop_name, shop_slug, legal_name, business_type, pan, gstin,
                registered_address, pickup_address, contact_phone, contact_email, shop_description, status, created_by)
            values (:id, :name, :slug, :legal, :type, :pan, :gstin,
                cast(:reg as jsonb), cast(:pickup as jsonb), :phone, :email, :description, 'DRAFT', :account)
            """.trimIndent(),
        )
            .param("id", id).param("name", req.shopName.trim()).param("slug", slug)
            .param("legal", req.legalName.trim()).param("type", req.businessType.name)
            .param("pan", kyc.pan).param("gstin", kyc.gstin)
            .param("reg", req.registeredAddress?.let(json::writeValueAsString))
            .param("pickup", (req.pickupAddress ?: req.registeredAddress)?.let(json::writeValueAsString))
            .param("phone", req.contactPhone?.trim()).param("email", req.contactEmail?.trim()?.lowercase())
            .param("description", req.shopDescription?.trim())
            .param("account", accountId)
            .update()
        jdbc.sql("insert into seller_member (seller_id, account_id, role) values (:s, :a, 'OWNER')")
            .param("s", id).param("a", accountId).update()
        recordStatus(id, null, SellerStatus.DRAFT, null, "seller", accountId)
        return shop(id)
    }

    @Transactional
    fun updateBusiness(current: CurrentSeller, req: UpdateBusinessRequest): ShopView {
        scope.enter(current.sellerId)
        val before = shop(current.sellerId)
        val touchesLegal = listOf(req.legalName, req.businessType, req.pan, req.gstin, req.registeredAddress).any { it != null }
        if (touchesLegal && !SellerStatusMachine.businessEditable(before.status)) {
            throw ConflictException("Your business details are locked while the application is reviewed")
        }
        val kyc = Kyc.validate(req.pan ?: before.pan, req.gstin ?: before.gstin)
        val errors = if (kyc.pan == null) kyc.errors - "PAN is required" else kyc.errors
        if (touchesLegal && errors.isNotEmpty()) throw BadRequestException(errors.first())
        req.lowStockThreshold?.let { if (it !in 0..10_000) throw BadRequestException("Low-stock threshold must be between 0 and 10000") }

        jdbc.sql(
            """
            update seller set
                shop_name = coalesce(:name, shop_name),
                legal_name = coalesce(:legal, legal_name),
                business_type = coalesce(:type, business_type),
                pan = :pan, gstin = :gstin,
                registered_address = coalesce(cast(:reg as jsonb), registered_address),
                pickup_address = coalesce(cast(:pickup as jsonb), pickup_address),
                contact_phone = coalesce(:phone, contact_phone),
                contact_email = coalesce(:email, contact_email),
                shop_description = coalesce(:description, shop_description),
                shop_image = coalesce(:image, shop_image),
                shop_banner = coalesce(:banner, shop_banner),
                low_stock_threshold = coalesce(:threshold, low_stock_threshold),
                updated_at = now()
            where id = :id
            """.trimIndent(),
        )
            .param("id", current.sellerId)
            .param("name", req.shopName?.trim()?.ifEmpty { null })
            .param("legal", req.legalName?.trim()?.ifEmpty { null })
            .param("type", req.businessType?.name)
            .param("pan", if (touchesLegal) kyc.pan else before.pan)
            .param("gstin", if (touchesLegal) kyc.gstin else before.gstin)
            .param("reg", req.registeredAddress?.let(json::writeValueAsString))
            .param("pickup", req.pickupAddress?.let(json::writeValueAsString))
            .param("phone", req.contactPhone?.trim())
            .param("email", req.contactEmail?.trim()?.lowercase())
            .param("description", req.shopDescription?.trim())
            .param("image", req.shopImage?.trim())
            .param("banner", req.shopBanner?.trim())
            .param("threshold", req.lowStockThreshold)
            .update()
        return shop(current.sellerId)
    }

    /** DRAFT / NEEDS_INFO → SUBMITTED, once nothing on the checklist is missing. */
    @Transactional
    fun submit(current: CurrentSeller): ShopView {
        scope.enter(current.sellerId)
        val missing = checklist(current.sellerId)
        if (missing.isNotEmpty()) throw ConflictException("Before submitting: ${missing.joinToString("; ")}")
        val shop = shop(current.sellerId)
        val next = SellerStatusMachine.next(shop.status, SellerAction.SUBMIT)
        jdbc.sql("update seller set status = :s, status_note = null, submitted_at = now(), updated_at = now() where id = :id")
            .param("s", next.name).param("id", shop.id).update()
        recordStatus(shop.id, shop.status, next, null, "seller", current.accountId)
        outbox.record(SellerTopics.APPLICATION_SUBMITTED, shop.id.toString(), ApplicationSubmitted(shop.id, shop.shopName, ownerEmail(shop.id)))
        return shop(shop.id)
    }

    /** Everything an application needs; the seller sees this list on their overview. */
    fun checklist(sellerId: UUID): List<String> {
        val s = shop(sellerId)
        val missing = mutableListOf<String>()
        if (s.legalName.isNullOrBlank()) missing += "Add your legal business name"
        if (s.businessType == null) missing += "Choose your business type"
        if (!Kyc.isValidPan(s.pan)) missing += "Add your PAN"
        if (s.registeredAddress == null) missing += "Add your registered address"
        if (s.pickupAddress == null) missing += "Add a pickup address"
        if (s.contactPhone.isNullOrBlank()) missing += "Add a contact phone number"
        val kinds = documents(sellerId).map { it.kind }.toSet()
        if (KycDocumentKind.PAN !in kinds) missing += "Upload a copy of your PAN card"
        if (s.gstin != null && KycDocumentKind.GST_CERTIFICATE !in kinds) missing += "Upload your GST certificate"
        if (bank(sellerId) == null) missing += "Add the bank account for payouts"
        return missing
    }

    // ================================================================ KYC documents

    @Transactional(readOnly = true)
    fun listDocuments(current: CurrentSeller): List<KycDocumentView> {
        scope.enter(current.sellerId)
        return documents(current.sellerId)
    }

    @Transactional
    fun uploadDocument(current: CurrentSeller, kind: KycDocumentKind, filename: String, contentType: String, content: ByteArray): KycDocumentView {
        scope.enter(current.sellerId)
        if (!SellerStatusMachine.businessEditable(shop(current.sellerId).status)) {
            throw ConflictException("Documents are locked while the application is reviewed")
        }
        if (content.isEmpty()) throw BadRequestException("The file is empty")
        if (content.size > MAX_DOCUMENT_BYTES) throw BadRequestException("Documents must be 8 MB or smaller")
        val type = DocumentTypes.sniff(content) ?: throw BadRequestException("Upload a PDF, JPG, PNG or WebP file")
        val count = jdbc.sql("select count(*) from seller_kyc_document where seller_id = :s").param("s", current.sellerId).query(Long::class.javaObjectType).single()
        if (count >= MAX_DOCUMENTS) throw ConflictException("You can keep up to $MAX_DOCUMENTS documents — remove one first")

        val stored = storage.put(Bucket.PRIVATE, "kyc/${current.sellerId}", filename, type, content)
        val id = Ids.newId()
        jdbc.sql(
            """
            insert into seller_kyc_document (id, seller_id, kind, storage_key, filename, content_type, bytes, uploaded_by)
            values (:id, :s, :kind, :key, :name, :type, :bytes, :by)
            """.trimIndent(),
        )
            .param("id", id).param("s", current.sellerId).param("kind", kind.name)
            .param("key", stored.key).param("name", filename.take(200)).param("type", type)
            .param("bytes", stored.bytes).param("by", current.accountId)
            .update()
        return documents(current.sellerId).first { it.id == id }
    }

    @Transactional
    fun deleteDocument(current: CurrentSeller, documentId: UUID) {
        scope.enter(current.sellerId)
        if (!SellerStatusMachine.businessEditable(shop(current.sellerId).status)) {
            throw ConflictException("Documents are locked while the application is reviewed")
        }
        val key = documentKey(current.sellerId, documentId)
        jdbc.sql("delete from seller_kyc_document where id = :id").param("id", documentId).update()
        storage.delete(Bucket.PRIVATE, key)
    }

    @Transactional(readOnly = true)
    fun documentUrl(current: CurrentSeller, documentId: UUID): String {
        scope.enter(current.sellerId)
        return storage.signedUrl(documentKey(current.sellerId, documentId))
    }

    // ================================================================ bank account

    @Transactional(readOnly = true)
    fun getBank(current: CurrentSeller): BankAccountView? {
        scope.enter(current.sellerId)
        return bank(current.sellerId)
    }

    @Transactional
    fun saveBank(current: CurrentSeller, req: BankAccountRequest): BankAccountView {
        scope.enter(current.sellerId)
        val ifsc = Kyc.normalise(req.ifsc)
        if (!Kyc.isValidIfsc(ifsc)) throw BadRequestException("IFSC must look like HDFC0001234")
        jdbc.sql(
            """
            insert into seller_bank_account (seller_id, account_name, account_number_enc, account_last4, ifsc, bank_name, verified_at, updated_at)
            values (:s, :name, :enc, :last4, :ifsc, :bank, null, now())
            on conflict (seller_id) do update set
                account_name = excluded.account_name, account_number_enc = excluded.account_number_enc,
                account_last4 = excluded.account_last4, ifsc = excluded.ifsc, bank_name = excluded.bank_name,
                verified_at = null, updated_at = now()
            """.trimIndent(),
        )
            .param("s", current.sellerId).param("name", req.accountName.trim())
            .param("enc", crypto.encrypt(req.accountNumber)).param("last4", req.accountNumber.takeLast(4))
            .param("ifsc", ifsc).param("bank", req.bankName?.trim())
            .update()
        audit.record("seller", current.accountId, "UPDATE", "seller_bank_account", current.sellerId.toString(), after = mapOf("last4" to req.accountNumber.takeLast(4), "ifsc" to ifsc))
        return bank(current.sellerId)!!
    }

    // ================================================================ team

    @Transactional(readOnly = true)
    fun members(current: CurrentSeller): Pair<List<MemberView>, List<InviteView>> {
        scope.enter(current.sellerId)
        val members = jdbc.sql(
            """
            select a.id, a.full_name, a.email, m.role, m.created_at from seller_member m
            join seller_account a on a.id = m.account_id
            where m.seller_id = :s order by m.created_at
            """.trimIndent(),
        ).param("s", current.sellerId).query { rs, _ -> memberView(rs) }.list()
        val invites = jdbc.sql(
            """
            select id, email, role, expires_at, created_at from seller_invite
            where seller_id = :s and accepted_at is null and expires_at > now() order by created_at
            """.trimIndent(),
        ).param("s", current.sellerId).query { rs, _ ->
            InviteView(rs.getObject("id", UUID::class.java), rs.getString("email"), SellerRole.valueOf(rs.getString("role")),
                rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("created_at").toInstant())
        }.list()
        return members to invites
    }

    @Transactional
    fun invite(current: CurrentSeller, req: InviteRequest): InviteView {
        scope.enter(current.sellerId)
        if (req.role == SellerRole.OWNER) throw BadRequestException("A shop has exactly one owner")
        val email = req.email.trim().lowercase()
        val already = jdbc.sql(
            "select exists (select 1 from seller_member m join seller_account a on a.id = m.account_id where m.seller_id = :s and lower(a.email) = :e)",
        ).param("s", current.sellerId).param("e", email).query(Boolean::class.javaObjectType).single()
        if (already) throw ConflictException("$email is already in this shop")
        jdbc.sql("delete from seller_invite where seller_id = :s and lower(email) = :e and accepted_at is null")
            .param("s", current.sellerId).param("e", email).update()

        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
        val id = Ids.newId()
        val expires = Instant.now().plus(INVITE_TTL)
        jdbc.sql(
            """
            insert into seller_invite (id, seller_id, email, role, token_hash, invited_by, expires_at)
            values (:id, :s, :e, :role, :hash, :by, :exp)
            """.trimIndent(),
        )
            .param("id", id).param("s", current.sellerId).param("e", email).param("role", req.role.name)
            .param("hash", hash(token)).param("by", current.accountId).param("exp", java.sql.Timestamp.from(expires))
            .update()
        outbox.record(SellerTopics.MEMBER_INVITED, current.sellerId.toString(),
            MemberInvited(current.sellerId, shopName(current.sellerId), email, req.role, token))
        return InviteView(id, email, req.role, expires, Instant.now())
    }

    @Transactional
    fun revokeInvite(current: CurrentSeller, inviteId: UUID) {
        scope.enter(current.sellerId)
        val n = jdbc.sql("delete from seller_invite where id = :id and seller_id = :s and accepted_at is null")
            .param("id", inviteId).param("s", current.sellerId).update()
        if (n == 0) throw NotFoundException("Invite not found")
    }

    @Transactional
    fun removeMember(current: CurrentSeller, accountId: UUID) {
        scope.enter(current.sellerId)
        val role = jdbc.sql("select role from seller_member where seller_id = :s and account_id = :a")
            .param("s", current.sellerId).param("a", accountId).query(String::class.java).optional().orElseThrow { NotFoundException("Member not found") }
        if (role == SellerRole.OWNER.name) throw ConflictException("The owner cannot be removed")
        jdbc.sql("delete from seller_member where seller_id = :s and account_id = :a").param("s", current.sellerId).param("a", accountId).update()
        audit.record("seller", current.accountId, "DELETE", "seller_member", "${current.sellerId}/$accountId")
    }

    /** Joins the invited shop. Runs unscoped: the caller is not a member until it succeeds. */
    @Transactional
    fun acceptInvite(accountId: UUID, accountEmail: String, token: String): MembershipView {
        val invite = jdbc.sql(
            "select id, seller_id, email, role, expires_at, accepted_at from seller_invite where token_hash = :h",
        ).param("h", hash(token)).query { rs, _ ->
            InviteRow(rs.getObject("id", UUID::class.java), rs.getObject("seller_id", UUID::class.java), rs.getString("email"),
                SellerRole.valueOf(rs.getString("role")), rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("accepted_at") != null)
        }.optional().orElseThrow { NotFoundException("This invite link is not valid") }
        if (invite.accepted || invite.expiresAt.isBefore(Instant.now())) throw ConflictException("This invite has expired — ask for a new one")
        if (!invite.email.equals(accountEmail, ignoreCase = true)) throw ConflictException("This invite was sent to a different email address")
        jdbc.sql("insert into seller_member (seller_id, account_id, role) values (:s, :a, :r) on conflict do nothing")
            .param("s", invite.sellerId).param("a", accountId).param("r", invite.role.name).update()
        jdbc.sql("update seller_invite set accepted_at = now() where id = :id").param("id", invite.id).update()
        return MembershipView(invite.sellerId, shopName(invite.sellerId), invite.role, SellerStatus.valueOf(statusOf(invite.sellerId)))
    }

    // ================================================================ staff review

    @Transactional(readOnly = true)
    fun adminList(status: SellerStatus?, query: String?, page: PageParams): Page<ShopView> {
        val where = buildString {
            append("where not is_platform")
            if (status != null) append(" and status = :status")
            if (!query.isNullOrBlank()) append(" and (shop_name ilike :q or legal_name ilike :q or shop_slug ilike :q or gstin ilike :q or pan ilike :q)")
        }
        fun <T : JdbcClient.StatementSpec> T.bind(): T = apply {
            if (status != null) param("status", status.name)
            if (!query.isNullOrBlank()) param("q", "%${query.trim()}%")
        }
        val total = jdbc.sql("select count(*) from seller $where").bind().query(Long::class.javaObjectType).single()
        val items = jdbc.sql("select * from seller $where order by coalesce(submitted_at, created_at) desc limit :limit offset :offset")
            .bind().param("limit", page.safeLimit).param("offset", page.offset)
            .query { rs, _ -> shopView(rs) }.list()
        return Page(items, total, page.safePage, page.safeLimit)
    }

    @Transactional(readOnly = true)
    fun adminDetail(sellerId: UUID): SellerReviewView {
        val shop = shop(sellerId)
        val owner = jdbc.sql(
            """
            select a.id, a.full_name, a.email, m.role, m.created_at from seller_member m
            join seller_account a on a.id = m.account_id where m.seller_id = :s and m.role = 'OWNER'
            """.trimIndent(),
        ).param("s", sellerId).query { rs, _ -> memberView(rs) }.optional().orElse(null)
        val docs = documents(sellerId).map { ReviewDocument(it, storage.signedUrl(documentKey(sellerId, it.id))) }
        val history = jdbc.sql(
            "select from_status, to_status, note, actor_realm, created_at from seller_status_event where seller_id = :s order by created_at",
        ).param("s", sellerId).query { rs, _ ->
            StatusEventView(rs.getString("from_status"), rs.getString("to_status"), rs.getString("note"),
                rs.getString("actor_realm"), rs.getTimestamp("created_at").toInstant())
        }.list()
        return SellerReviewView(shop, owner, docs, bank(sellerId), history, SellerStatusMachine.allowed(shop.status) - SellerAction.SUBMIT)
    }

    @Transactional
    fun decide(adminId: UUID, sellerId: UUID, req: DecisionRequest): ShopView {
        if (req.action.by != SellerAction.Actor.STAFF) throw BadRequestException("That is the seller's step, not a review decision")
        val shop = shop(sellerId)
        if (shop.isPlatform) throw ConflictException("The platform shop is not reviewed")
        val note = req.note?.trim()?.ifEmpty { null }
        if (req.action in setOf(SellerAction.REJECT, SellerAction.REQUEST_INFO, SellerAction.SUSPEND) && note == null) {
            throw BadRequestException("Add a note so the seller knows what to fix")
        }
        val next = SellerStatusMachine.next(shop.status, req.action)
        jdbc.sql("update seller set status = :s, status_note = :note, decided_at = now(), updated_at = now() where id = :id")
            .param("s", next.name).param("note", note).param("id", sellerId).update()
        recordStatus(sellerId, shop.status, next, note, "admin", adminId)
        audit.record("admin", adminId, req.action.name, "seller", sellerId.toString(), mapOf("status" to shop.status), mapOf("status" to next, "note" to note))
        if (next != SellerStatus.UNDER_REVIEW) {
            outbox.record(SellerTopics.APPLICATION_DECIDED, sellerId.toString(),
                ApplicationDecided(sellerId, shop.shopName, ownerEmail(sellerId), next, note))
        }
        return shop(sellerId)
    }

    @Transactional
    fun setCommission(adminId: UUID, sellerId: UUID, rateBp: Int?): ShopView {
        if (rateBp != null && rateBp !in 0..10_000) throw BadRequestException("Commission must be between 0% and 100%")
        val before = shop(sellerId)
        jdbc.sql("update seller set commission_rate_bp = :r, updated_at = now() where id = :id").param("r", rateBp).param("id", sellerId).update()
        audit.record("admin", adminId, "UPDATE", "seller.commission", sellerId.toString(), mapOf("rateBp" to before.commissionRateBp), mapOf("rateBp" to rateBp))
        return shop(sellerId)
    }

    // ================================================================ storefront

    @Transactional(readOnly = true)
    fun directory(query: String?, page: PageParams): Page<PublicShopView> {
        val filter = if (query.isNullOrBlank()) "" else " and shop_name ilike :q"
        fun <T : JdbcClient.StatementSpec> T.bind(): T = apply { if (!query.isNullOrBlank()) param("q", "%${query.trim()}%") }
        val total = jdbc.sql("select count(*) from seller where status = 'APPROVED' and not is_platform$filter").bind().query(Long::class.javaObjectType).single()
        val items = jdbc.sql("select * from seller where status = 'APPROVED' and not is_platform$filter order by rating_count desc, shop_name limit :l offset :o")
            .bind().param("l", page.safeLimit).param("o", page.offset).query { rs, _ -> publicView(rs) }.list()
        return Page(items, total, page.safePage, page.safeLimit)
    }

    @Transactional(readOnly = true)
    fun publicShop(slug: String): PublicShopView =
        jdbc.sql("select * from seller where shop_slug = :s and status = 'APPROVED'").param("s", slug)
            .query { rs, _ -> publicView(rs) }.optional().orElseThrow { NotFoundException("Shop not found") }

    // ================================================================ helpers

    fun shop(sellerId: UUID): ShopView =
        jdbc.sql("select * from seller where id = :id").param("id", sellerId)
            .query { rs, _ -> shopView(rs) }.optional().orElseThrow { NotFoundException("Shop not found") }

    private fun shopName(sellerId: UUID) =
        jdbc.sql("select shop_name from seller where id = :id").param("id", sellerId).query(String::class.java).optional().orElse("")

    private fun statusOf(sellerId: UUID) =
        jdbc.sql("select status from seller where id = :id").param("id", sellerId).query(String::class.java).single()

    private fun ownerEmail(sellerId: UUID): String =
        jdbc.sql("select a.email from seller_member m join seller_account a on a.id = m.account_id where m.seller_id = :s and m.role = 'OWNER'")
            .param("s", sellerId).query(String::class.java).optional().orElse("")

    private fun documents(sellerId: UUID): List<KycDocumentView> =
        jdbc.sql("select id, kind, filename, content_type, bytes, created_at from seller_kyc_document where seller_id = :s order by created_at")
            .param("s", sellerId)
            .query { rs, _ ->
                KycDocumentView(rs.getObject("id", UUID::class.java), KycDocumentKind.valueOf(rs.getString("kind")),
                    rs.getString("filename"), rs.getString("content_type"), rs.getLong("bytes"), rs.getTimestamp("created_at").toInstant())
            }.list()

    private fun documentKey(sellerId: UUID, documentId: UUID): String =
        jdbc.sql("select storage_key from seller_kyc_document where id = :id and seller_id = :s")
            .param("id", documentId).param("s", sellerId).query(String::class.java).optional()
            .orElseThrow { NotFoundException("Document not found") }

    private fun bank(sellerId: UUID): BankAccountView? =
        jdbc.sql("select account_name, account_last4, ifsc, bank_name, verified_at, updated_at from seller_bank_account where seller_id = :s")
            .param("s", sellerId)
            .query { rs, _ ->
                BankAccountView(rs.getString("account_name"), "••••••" + rs.getString("account_last4"), rs.getString("ifsc"),
                    rs.getString("bank_name"), rs.getTimestamp("verified_at") != null, rs.getTimestamp("updated_at").toInstant())
            }.optional().orElse(null)

    private fun recordStatus(sellerId: UUID, from: SellerStatus?, to: SellerStatus, note: String?, realm: String, actor: UUID?) {
        jdbc.sql(
            """
            insert into seller_status_event (id, seller_id, from_status, to_status, note, actor_realm, actor_id)
            values (:id, :s, :from, :to, :note, :realm, :actor)
            """.trimIndent(),
        )
            .param("id", Ids.newId()).param("s", sellerId).param("from", from?.name).param("to", to.name)
            .param("note", note).param("realm", realm).param("actor", actor)
            .update()
    }

    private fun memberView(rs: ResultSet) = MemberView(
        rs.getObject("id", UUID::class.java), rs.getString("full_name"), rs.getString("email"),
        SellerRole.valueOf(rs.getString("role")), rs.getTimestamp("created_at").toInstant(),
    )

    private fun address(raw: String?): PostalAddress? = raw?.let { json.readValue(it, PostalAddress::class.java) }

    private fun shopView(rs: ResultSet) = ShopView(
        id = rs.getObject("id", UUID::class.java),
        shopName = rs.getString("shop_name"),
        shopSlug = rs.getString("shop_slug"),
        legalName = rs.getString("legal_name"),
        businessType = rs.getString("business_type")?.let(BusinessType::valueOf),
        pan = rs.getString("pan"),
        gstin = rs.getString("gstin"),
        registeredAddress = address(rs.getString("registered_address")),
        pickupAddress = address(rs.getString("pickup_address")),
        contactPhone = rs.getString("contact_phone"),
        contactEmail = rs.getString("contact_email"),
        shopDescription = rs.getString("shop_description"),
        shopImage = rs.getString("shop_image"),
        shopBanner = rs.getString("shop_banner"),
        status = SellerStatus.valueOf(rs.getString("status")),
        statusNote = rs.getString("status_note"),
        commissionRateBp = rs.getObject("commission_rate_bp") as Int?,
        lowStockThreshold = rs.getInt("low_stock_threshold"),
        rating = rs.getDouble("rating"),
        ratingCount = rs.getInt("rating_count"),
        isPlatform = rs.getBoolean("is_platform"),
        submittedAt = rs.getTimestamp("submitted_at")?.toInstant(),
        decidedAt = rs.getTimestamp("decided_at")?.toInstant(),
        createdAt = rs.getTimestamp("created_at").toInstant(),
    )

    private fun publicView(rs: ResultSet) = PublicShopView(
        rs.getObject("id", UUID::class.java), rs.getString("shop_name"), rs.getString("shop_slug"),
        rs.getString("shop_description"), rs.getString("shop_image"), rs.getString("shop_banner"),
        rs.getDouble("rating"), rs.getInt("rating_count"), rs.getTimestamp("created_at").toInstant(),
    )

    private fun hash(token: String) = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.toByteArray()))

    private data class InviteRow(val id: UUID, val sellerId: UUID, val email: String, val role: SellerRole, val expiresAt: Instant, val accepted: Boolean)

    companion object {
        const val MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
        const val MAX_DOCUMENTS = 12
        val INVITE_TTL: Duration = Duration.ofDays(7)
    }
}

/** Identifies an upload by its first bytes, never by the name or header the client sent. */
object DocumentTypes {
    fun sniff(bytes: ByteArray): String? = when {
        bytes.startsWith(byteArrayOf(0x25, 0x50, 0x44, 0x46)) -> "application/pdf"
        bytes.startsWith(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())) -> "image/jpeg"
        bytes.startsWith(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)) -> "image/png"
        bytes.size >= 12 && bytes.startsWith("RIFF".toByteArray()) && bytes.copyOfRange(8, 12).contentEquals("WEBP".toByteArray()) -> "image/webp"
        else -> null
    }

    private fun ByteArray.startsWith(prefix: ByteArray) = size >= prefix.size && copyOfRange(0, prefix.size).contentEquals(prefix)
}
