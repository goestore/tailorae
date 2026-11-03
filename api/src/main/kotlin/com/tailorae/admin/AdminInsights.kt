package com.tailorae.admin

import com.tailorae.common.ApiResponse
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.SystemSettings
import com.tailorae.common.toResponse
import com.tailorae.identity.AdminAccess
import com.tailorae.identity.AdminPermission
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.sql.Timestamp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * The staff console's read side: the dashboard, the queue badges, reports,
 * settings and the audit trail. Reads across every module; writes only the
 * platform settings.
 */
@Service
class AdminInsights(private val jdbc: JdbcClient, private val settings: SystemSettings, private val audit: Audit) {

    /** Work waiting for staff — the sidebar badges. */
    fun queues(): Map<String, Long> = jdbc.sql(
        """
        select (select count(*) from product where moderation_status = 'PENDING' and status <> 'DISCONTINUED') as products_awaiting_moderation,
               (select count(*) from seller where status in ('SUBMITTED', 'UNDER_REVIEW')) as sellers_awaiting_review,
               (select count(*) from seller_brand where status = 'PENDING') as brands_awaiting_review,
               (select count(*) from return_request where status in ('PENDING', 'APPROVED')) as returns_open,
               (select count(*) from withdrawal_request where status in ('PENDING', 'APPROVED')) as withdrawals_open,
               (select count(*) from payment_event where kind = 'ANOMALY' and created_at > now() - interval '30 days') as payment_anomalies
        """.trimIndent(),
    ).query { rs, _ ->
        mapOf(
            "productsAwaitingModeration" to rs.getLong(1), "sellersAwaitingReview" to rs.getLong(2), "brandsAwaitingReview" to rs.getLong(3),
            // The legacy console reads this name for the sellers badge.
            "sellersAwaitingKyc" to rs.getLong(2),
            "returnsOpen" to rs.getLong(4), "withdrawalsOpen" to rs.getLong(5), "paymentAnomalies" to rs.getLong(6),
        )
    }.single()

    fun dashboard(now: Instant = Instant.now()): Map<String, Any?> {
        val today = LocalDate.now(IST)
        val dayStart = Timestamp.from(today.atStartOfDay(IST).toInstant())
        val monthStart = Timestamp.from(today.withDayOfMonth(1).atStartOfDay(IST).toInstant())
        val weekStart = Timestamp.from(today.minusDays(6).atStartOfDay(IST).toInstant())

        val stats = jdbc.sql(
            """
            select (select count(*) from customer where status = 'ACTIVE') as customers,
                   (select coalesce(sum(total_paise - refunded_paise), 0) from customer_order where payment_status in ('PAID', 'REFUNDED')) as revenue,
                   (select coalesce(sum(total_paise), 0) from customer_order where payment_method = 'COD' and payment_status = 'PENDING' and status not in ('CANCELLED', 'RETURNED')) as cod_pending,
                   (select count(*) from customer_order where created_at >= :day) as orders_today,
                   (select count(*) from customer_order where created_at >= :month) as orders_month,
                   (select coalesce(sum(total_paise), 0) from customer_order where created_at >= :month and status not in ('CANCELLED', 'RETURNED')) as gmv_month,
                   (select count(*) from customer_order where status in ('CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT')) as to_ship,
                   (select count(*) from product where status = 'ACTIVE' and moderation_status = 'APPROVED') as live_products,
                   (select count(*) from product where status = 'ACTIVE' and thumbnail is null and cardinality(images) = 0) as no_images,
                   (select count(*) from seller where status = 'APPROVED' and not is_platform) as live_sellers
            """.trimIndent(),
        ).param("day", dayStart).param("month", monthStart).query { rs, _ ->
            mapOf(
                "totalCustomers" to rs.getLong("customers"), "totalRevenuePaise" to rs.getLong("revenue"),
                "codPendingRevenuePaise" to rs.getLong("cod_pending"), "ordersToday" to rs.getLong("orders_today"),
                "ordersThisMonth" to rs.getLong("orders_month"), "gmvThisMonthPaise" to rs.getLong("gmv_month"),
                "ordersToShip" to rs.getLong("to_ship"), "liveProducts" to rs.getLong("live_products"),
                "productsWithoutImages" to rs.getLong("no_images"), "liveSellers" to rs.getLong("live_sellers"),
            )
        }.single()

        val byDay = jdbc.sql(
            """
            select (created_at at time zone 'Asia/Kolkata')::date as day, coalesce(sum(total_paise), 0) as revenue, count(*) as orders
            from customer_order where created_at >= :week and status not in ('CANCELLED')
            group by 1 order by 1
            """.trimIndent(),
        ).param("week", weekStart).query { rs, _ -> rs.getDate("day").toLocalDate() to (rs.getLong("revenue") to rs.getLong("orders")) }.list().toMap()
        val week = (6 downTo 0).map { today.minusDays(it.toLong()) }.map { d ->
            mapOf("date" to d.toString(), "revenuePaise" to (byDay[d]?.first ?: 0L), "orders" to (byDay[d]?.second ?: 0L))
        }

        val lowStock = jdbc.sql(
            "select p.id, p.name, p.quantity, s.shop_name from product p join seller s on s.id = p.seller_id where p.status = 'ACTIVE' and p.quantity < 10 order by p.quantity, p.name limit 6",
        ).query { rs, _ -> mapOf("id" to rs.getObject("id"), "name" to rs.getString("name"), "quantity" to rs.getInt("quantity"), "shopName" to rs.getString("shop_name")) }.list()

        val top = topProducts(Instant.EPOCH, now, 5)

        val codPending = jdbc.sql(
            """
            select id, order_number, total_paise, contact_email, created_at from customer_order
            where payment_method = 'COD' and payment_status = 'PENDING' and status not in ('CANCELLED', 'RETURNED')
            order by created_at desc limit 5
            """.trimIndent(),
        ).query { rs, _ ->
            mapOf("id" to rs.getObject("id"), "orderNumber" to rs.getString("order_number"), "totalPaise" to rs.getLong("total_paise"),
                "customerEmail" to rs.getString("contact_email"), "createdAt" to rs.getTimestamp("created_at").toInstant())
        }.list()

        return mapOf("stats" to stats, "week" to week, "lowStock" to lowStock, "topProducts" to top, "codPending" to codPending, "queues" to queues())
    }

    /** Sales between two dates (inclusive, IST): totals, by day, by seller, by category, best sellers. */
    fun report(from: LocalDate, to: LocalDate): Map<String, Any?> {
        if (to.isBefore(from)) throw BadRequestException("The end date is before the start date")
        if (from.plusDays(366).isBefore(to)) throw BadRequestException("Reports cover at most a year")
        val start = from.atStartOfDay(IST).toInstant()
        val end = to.plusDays(1).atStartOfDay(IST).toInstant()
        val range = "o.created_at >= :start and o.created_at < :end and o.status not in ('CANCELLED')"
        fun <T : JdbcClient.StatementSpec> T.window(): T = apply { param("start", Timestamp.from(start)); param("end", Timestamp.from(end)) }

        val totals = jdbc.sql(
            """
            select count(*) as orders, coalesce(sum(o.total_paise), 0) as gmv, coalesce(sum(o.discount_paise), 0) as discounts,
                   coalesce(sum(o.shipping_paise), 0) as shipping, coalesce(sum(o.refunded_paise), 0) as refunds,
                   coalesce(avg(o.total_paise), 0)::bigint as aov
            from customer_order o where $range
            """.trimIndent(),
        ).window().query { rs, _ ->
            mapOf("orders" to rs.getLong("orders"), "gmvPaise" to rs.getLong("gmv"), "discountsPaise" to rs.getLong("discounts"),
                "shippingPaise" to rs.getLong("shipping"), "refundsPaise" to rs.getLong("refunds"), "averageOrderPaise" to rs.getLong("aov"))
        }.single()
        val commission = jdbc.sql("select coalesce(sum(so.commission_paise), 0) from seller_order so join customer_order o on o.id = so.order_id where $range and so.status not in ('CANCELLED', 'RETURNED')")
            .window().query(Long::class.javaObjectType).single()

        val byDay = jdbc.sql(
            """
            select (o.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as orders, coalesce(sum(o.total_paise), 0) as gmv
            from customer_order o where $range group by 1 order by 1
            """.trimIndent(),
        ).window().query { rs, _ -> mapOf("date" to rs.getDate("day").toLocalDate().toString(), "orders" to rs.getLong("orders"), "gmvPaise" to rs.getLong("gmv")) }.list()

        val bySeller = jdbc.sql(
            """
            select s.id, s.shop_name, count(*) as orders, coalesce(sum(so.total_paise), 0) as gmv, coalesce(sum(so.commission_paise), 0) as commission
            from seller_order so join customer_order o on o.id = so.order_id join seller s on s.id = so.seller_id
            where $range and so.status not in ('CANCELLED', 'RETURNED') group by s.id, s.shop_name order by gmv desc limit 50
            """.trimIndent(),
        ).window().query { rs, _ ->
            mapOf("sellerId" to rs.getObject("id"), "shopName" to rs.getString("shop_name"), "orders" to rs.getLong("orders"),
                "gmvPaise" to rs.getLong("gmv"), "commissionPaise" to rs.getLong("commission"))
        }.list()

        val byCategory = jdbc.sql(
            """
            select c.name, sum(i.quantity) as units, coalesce(sum(i.unit_paise * i.quantity - i.discount_paise), 0) as revenue
            from order_item i join customer_order o on o.id = i.order_id join product p on p.id = i.product_id join category c on c.id = p.category_id
            where $range group by c.name order by revenue desc limit 50
            """.trimIndent(),
        ).window().query { rs, _ -> mapOf("category" to rs.getString("name"), "units" to rs.getLong("units"), "revenuePaise" to rs.getLong("revenue")) }.list()

        return mapOf(
            "from" to from.toString(), "to" to to.toString(), "totals" to totals + ("commissionPaise" to commission),
            "byDay" to byDay, "bySeller" to bySeller, "byCategory" to byCategory, "topProducts" to topProducts(start, end, 20),
        )
    }

    fun reportCsv(from: LocalDate, to: LocalDate): String {
        @Suppress("UNCHECKED_CAST")
        val rows = report(from, to)["byDay"] as List<Map<String, Any?>>
        val lines = listOf("Date,Orders,GMV (INR)") + rows.map { "${it["date"]},${it["orders"]},${"%.2f".format((it["gmvPaise"] as Long) / 100.0)}" }
        return lines.joinToString("\r\n", postfix = "\r\n")
    }

    private fun topProducts(start: Instant, end: Instant, limit: Int) = jdbc.sql(
        """
        select p.id, p.name, p.price_paise, c.name as category, sum(i.quantity) as units
        from order_item i join customer_order o on o.id = i.order_id join product p on p.id = i.product_id join category c on c.id = p.category_id
        where o.status in ('CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'DELIVERED') and o.created_at >= :s and o.created_at < :e
        group by p.id, p.name, p.price_paise, c.name order by units desc limit :l
        """.trimIndent(),
    ).param("s", Timestamp.from(start)).param("e", Timestamp.from(end)).param("l", limit).query { rs, _ ->
        mapOf("id" to rs.getObject("id"), "name" to rs.getString("name"), "pricePaise" to rs.getLong("price_paise"),
            "category" to rs.getString("category"), "unitsSold" to rs.getLong("units"))
    }.list()

    // ------------------------------------------------------------ settings

    fun settings(): Map<String, Any?> = settings.all()

    /** Only known keys, each checked; anything else is refused rather than stored. */
    @Transactional
    fun updateSettings(adminId: UUID, held: Set<AdminPermission>, changes: Map<String, Any?>): Map<String, Any?> {
        for ((key, value) in changes) {
            val rule = SETTINGS[key] ?: throw BadRequestException("Unknown setting: $key")
            if (AdminPermission.SUPER_ADMIN !in held && rule.permission !in held) throw BadRequestException("You cannot change $key")
            rule.check(value)?.let { throw BadRequestException("$key: $it") }
        }
        val before = settings.all()
        changes.forEach { (k, v) -> settings.set(k, v) }
        audit.record("admin", adminId, "UPDATE", "system_setting", null, before.filterKeys { it in changes }, changes)
        return settings.all()
    }

    fun auditLog(entity: String?, entityId: String?, page: PageParams): Page<Map<String, Any?>> {
        val where = "where (cast(:e as text) is null or entity = :e) and (cast(:id as text) is null or entity_id = :id)"
        val total = jdbc.sql("select count(*) from audit_log $where").param("e", entity).param("id", entityId).query(Long::class.javaObjectType).single()
        val items = jdbc.sql(
            """
            select l.*, a.email as actor_email from audit_log l left join admin_user a on a.id = l.actor_id and l.actor_realm = 'admin'
            $where order by l.created_at desc limit :l offset :o
            """.trimIndent(),
        ).param("e", entity).param("id", entityId).param("l", page.safeLimit).param("o", page.offset).query { rs, _ ->
            mapOf("id" to rs.getObject("id"), "actorRealm" to rs.getString("actor_realm"), "actorId" to rs.getObject("actor_id"),
                "actorEmail" to rs.getString("actor_email"), "action" to rs.getString("action"), "entity" to rs.getString("entity"),
                "entityId" to rs.getString("entity_id"), "before" to rs.getString("before"), "after" to rs.getString("after"),
                "createdAt" to rs.getTimestamp("created_at").toInstant())
        }.list()
        return Page(items, total, page.safePage, page.safeLimit)
    }

    private class SettingRule(val permission: AdminPermission, val check: (Any?) -> String?)

    companion object {
        val IST: ZoneId = ZoneId.of("Asia/Kolkata")

        private fun longIn(min: Long, max: Long): (Any?) -> String? = { v ->
            val n = (v as? Number)?.toLong()
            if (n == null || n < min || n > max) "must be a whole number from $min to $max" else null
        }

        private val SETTINGS = mapOf(
            SystemSettings.SELLER_APPLICATIONS_OPEN to SettingRule(AdminPermission.KYC_REVIEW) { v -> if (v is Boolean) null else "must be true or false" },
            SystemSettings.DEFAULT_COMMISSION_BP to SettingRule(AdminPermission.FINANCE, longIn(0, 10_000)),
            SystemSettings.SETTLEMENT_HOLD_DAYS to SettingRule(AdminPermission.FINANCE, longIn(0, 60)),
            SystemSettings.FREE_SHIPPING_ABOVE_PAISE to SettingRule(AdminPermission.FINANCE, longIn(0, 10_000_000)),
            SystemSettings.FLAT_SHIPPING_PAISE to SettingRule(AdminPermission.FINANCE, longIn(0, 1_000_000)),
        )
    }
}

@RestController
@RequestMapping("/api/admin")
class AdminInsightsController(private val insights: AdminInsights, private val access: AdminAccess) {

    @GetMapping("/dashboard")
    fun dashboard(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any?>> {
        access.require(jwt, *AdminPermission.entries.toTypedArray())
        return ApiResponse.ok(insights.dashboard(), "Dashboard fetched")
    }

    @GetMapping("/queues")
    fun queues(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Long>> {
        access.require(jwt, *AdminPermission.entries.toTypedArray())
        return ApiResponse.ok(insights.queues())
    }

    @GetMapping("/reports")
    fun reports(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) from: LocalDate?,
        @RequestParam(required = false) to: LocalDate?,
        @RequestParam(defaultValue = "json") format: String,
    ): ResponseEntity<*> {
        access.require(jwt, AdminPermission.FINANCE, AdminPermission.SUPPORT)
        val end = to ?: LocalDate.now(AdminInsights.IST)
        val start = from ?: end.minusDays(29)
        return if (format == "csv") {
            ResponseEntity.ok().contentType(MediaType("text", "csv", Charsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sales-$start-to-$end.csv\"")
                .body(insights.reportCsv(start, end))
        } else {
            ResponseEntity.ok(ApiResponse.ok(insights.report(start, end)))
        }
    }

    @GetMapping("/settings")
    fun settings(@AuthenticationPrincipal jwt: Jwt): ApiResponse<Map<String, Any?>> {
        access.require(jwt, AdminPermission.FINANCE, AdminPermission.KYC_REVIEW)
        return ApiResponse.ok(insights.settings())
    }

    @PatchMapping("/settings")
    fun updateSettings(@AuthenticationPrincipal jwt: Jwt, @RequestBody body: Map<String, Any?>): ApiResponse<Map<String, Any?>> {
        val admin = access.require(jwt, AdminPermission.FINANCE, AdminPermission.KYC_REVIEW)
        return ApiResponse.ok(insights.updateSettings(admin, access.permissions(admin), body), "Settings saved")
    }

    @GetMapping("/audit")
    fun audit(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) entity: String?,
        @RequestParam(required = false) entityId: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
    ): ResponseEntity<ApiResponse<Page<Map<String, Any?>>>> {
        access.require(jwt, AdminPermission.SUPER_ADMIN)
        return insights.auditLog(entity, entityId, PageParams(page, limit)).toResponse()
    }
}
