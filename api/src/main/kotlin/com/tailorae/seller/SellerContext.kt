package com.tailorae.seller

import com.tailorae.common.ApiException
import com.tailorae.common.NotFoundException
import com.tailorae.common.accountId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Component
import java.util.UUID

/** Roles inside one seller business (docs/ACCOUNTS.md, "Seller team members"). */
enum class SellerRole { OWNER, MANAGER, CATALOG, FULFILMENT, FINANCE }

/** What a role may do. One row of the permission matrix per entry. */
enum class SellerPermission(vararg roles: SellerRole) {
    PROFILE(SellerRole.OWNER),
    MEMBERS(SellerRole.OWNER, SellerRole.MANAGER),
    CATALOG(SellerRole.OWNER, SellerRole.MANAGER, SellerRole.CATALOG),
    ORDERS(SellerRole.OWNER, SellerRole.MANAGER, SellerRole.FULFILMENT),
    RETURNS(SellerRole.OWNER, SellerRole.MANAGER, SellerRole.FULFILMENT),
    FINANCE(SellerRole.OWNER, SellerRole.FINANCE),

    /** Anyone in the business may look at its overview. */
    VIEW(*SellerRole.entries.toTypedArray());

    val roles: Set<SellerRole> = roles.toSet()
}

/** The business a seller-realm request acts for, and the caller's role in it. */
data class CurrentSeller(
    val sellerId: UUID,
    val accountId: UUID,
    val role: SellerRole,
    val status: SellerStatus,
) {
    val canSell: Boolean get() = status == SellerStatus.APPROVED

    fun can(permission: SellerPermission) = role in permission.roles
}

/**
 * Resolves the seller for a seller-realm request (docs/ACCOUNTS.md, layer 2).
 *
 * The business is never taken from a body or path: it is the caller's
 * membership, re-read from `seller_member` on every request. A person in
 * several businesses picks one with the `X-Seller-Id` header; that header only
 * selects among their own memberships, so naming someone else's business
 * answers 404 exactly like naming one that does not exist.
 */
@Component
class SellerContext(private val jdbc: JdbcClient) {

    /** The caller's business, or null while they have not created one yet. */
    fun current(jwt: Jwt, request: HttpServletRequest): CurrentSeller? {
        val requested = request.getHeader(HEADER)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        val memberships = memberships(jwt.accountId())
        if (requested != null) return memberships.firstOrNull { it.sellerId == requested } ?: throw NotFoundException("Shop not found")
        return memberships.firstOrNull()
    }

    /** As [current], but the caller must have a business and [permission] in it. */
    fun require(jwt: Jwt, request: HttpServletRequest, permission: SellerPermission): CurrentSeller {
        val seller = current(jwt, request) ?: throw NotFoundException("You have not set up a shop yet")
        if (!seller.can(permission)) throw ApiException(HttpStatus.FORBIDDEN, "Your role in this shop does not allow that")
        return seller
    }

    /** Every business the account belongs to, oldest membership first. */
    fun memberships(accountId: UUID): List<CurrentSeller> =
        jdbc.sql(
            """
            select m.seller_id, m.account_id, m.role, s.status
            from seller_member m join seller s on s.id = m.seller_id
            join seller_account a on a.id = m.account_id
            where m.account_id = :account and a.status = 'ACTIVE'
            order by m.created_at
            """.trimIndent(),
        )
            .param("account", accountId)
            .query { rs, _ ->
                CurrentSeller(
                    rs.getObject("seller_id", UUID::class.java),
                    rs.getObject("account_id", UUID::class.java),
                    SellerRole.valueOf(rs.getString("role")),
                    SellerStatus.valueOf(rs.getString("status")),
                )
            }
            .list()

    companion object {
        const val HEADER = "X-Seller-Id"
    }
}
