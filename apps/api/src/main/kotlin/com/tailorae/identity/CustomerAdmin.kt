package com.tailorae.identity

import com.tailorae.common.ApiResponse
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.NotFoundException
import com.tailorae.common.Page
import com.tailorae.common.PageParams
import com.tailorae.common.toResponse
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

data class CustomerAdminRow(
    val id: UUID, val email: String, val firstName: String, val lastName: String, val phone: String?, val type: String,
    val status: String, val emailVerified: Boolean, val orders: Long, val spentPaise: Long, val createdAt: Instant,
)

/** Staff view of shoppers (SUPPORT). Every read of one customer is audited — it is personal data. */
@Service
class CustomerAdminService(private val jdbc: JdbcClient, private val sessions: AuthSessionRepository, private val audit: Audit) {

    fun list(query: String?, status: String?, page: PageParams): Page<CustomerAdminRow> {
        val where = buildString {
            append("where 1 = 1")
            if (!query.isNullOrBlank()) append(" and (c.email ilike :q or c.first_name ilike :q or c.last_name ilike :q or c.phone ilike :q)")
            if (!status.isNullOrBlank()) append(" and c.status = :status")
        }
        fun <T : JdbcClient.StatementSpec> T.bind(): T = apply {
            if (!query.isNullOrBlank()) param("q", "%${query.trim()}%")
            if (!status.isNullOrBlank()) param("status", status.uppercase())
        }
        val total = jdbc.sql("select count(*) from customer c $where").bind().query(Long::class.javaObjectType).single()
        val rows = jdbc.sql("$SELECT $where order by c.created_at desc limit :l offset :o").bind()
            .param("l", page.safeLimit).param("o", page.offset).query { rs, _ -> row(rs) }.list()
        return Page(rows, total, page.safePage, page.safeLimit)
    }

    @Transactional
    fun detail(adminId: UUID, id: UUID): Map<String, Any?> {
        val customer = jdbc.sql("$SELECT where c.id = :id").param("id", id).query { rs, _ -> row(rs) }.optional()
            .orElseThrow { NotFoundException("Customer not found") }
        val addresses = jdbc.sql("select full_name, phone, line1, line2, city, state, postal_code, is_default from customer_address where customer_id = :id")
            .param("id", id).query { rs, _ ->
                mapOf("fullName" to rs.getString(1), "phone" to rs.getString(2), "line1" to rs.getString(3), "line2" to rs.getString(4),
                    "city" to rs.getString(5), "state" to rs.getString(6), "postalCode" to rs.getString(7), "isDefault" to rs.getBoolean(8))
            }.list()
        audit.record("admin", adminId, "VIEW", "customer", id.toString())
        return mapOf("customer" to customer, "addresses" to addresses)
    }

    @Transactional
    fun setStatus(adminId: UUID, id: UUID, status: String): CustomerAdminRow {
        if (status !in setOf("ACTIVE", "SUSPENDED")) throw BadRequestException("status must be ACTIVE or SUSPENDED")
        val n = jdbc.sql("update customer set status = :s, updated_at = now() where id = :id").param("s", status).param("id", id).update()
        if (n == 0) throw NotFoundException("Customer not found")
        if (status == "SUSPENDED") sessions.revokeAllFor(Realm.CUSTOMER.audience, id, Instant.now())
        audit.record("admin", adminId, "STATUS_$status", "customer", id.toString())
        return jdbc.sql("$SELECT where c.id = :id").param("id", id).query { rs, _ -> row(rs) }.single()
    }

    private fun row(rs: java.sql.ResultSet) = CustomerAdminRow(
        rs.getObject("id", UUID::class.java), rs.getString("email"), rs.getString("first_name"), rs.getString("last_name"),
        rs.getString("phone"), rs.getString("type"), rs.getString("status"), rs.getBoolean("verified"), rs.getLong("orders"),
        rs.getLong("spent"), rs.getTimestamp("created_at").toInstant(),
    )

    companion object {
        private const val SELECT = """
            select c.*, c.email_verified_at is not null as verified,
                   (select count(*) from customer_order o where o.customer_id = c.id) as orders,
                   (select coalesce(sum(o.total_paise - o.refunded_paise), 0) from customer_order o where o.customer_id = c.id and o.payment_status in ('PAID', 'REFUNDED')) as spent
            from customer c"""
    }
}

@RestController
@RequestMapping("/api/admin/customers")
class CustomerAdminController(private val customers: CustomerAdminService, private val access: AdminAccess) {
    @GetMapping
    fun list(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) status: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ): ResponseEntity<ApiResponse<Page<CustomerAdminRow>>> {
        access.require(jwt, AdminPermission.SUPPORT)
        return customers.list(q, status, PageParams(page, limit)).toResponse()
    }

    @GetMapping("/{id}")
    fun detail(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID) = ApiResponse.ok(customers.detail(access.require(jwt, AdminPermission.SUPPORT), id))

    @PatchMapping("/{id}/status")
    fun status(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody body: Map<String, String>) =
        ApiResponse.ok(customers.setStatus(access.require(jwt, AdminPermission.SUPPORT), id, body["status"]?.uppercase() ?: ""), "Customer updated")
}
