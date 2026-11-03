package com.tailorae.identity

import com.tailorae.common.ApiException
import com.tailorae.common.accountId
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Component
import java.util.UUID

/** Staff permissions (docs/ACCOUNTS.md, "Platform staff"). SUPER_ADMIN implies every other. */
enum class AdminPermission { SUPER_ADMIN, MODERATOR, KYC_REVIEW, FINANCE, SUPPORT, CONTENT }

/**
 * Checks a staff member's permission on every call, from the database rather
 * than the token, so revoking a permission takes effect immediately.
 */
@Component
class AdminAccess(private val jdbc: JdbcClient) {

    fun permissions(adminId: UUID): Set<AdminPermission> =
        jdbc.sql(
            """
            select p.permission from admin_permission p
            join admin_user a on a.id = p.admin_id
            where p.admin_id = :id and a.status = 'ACTIVE'
            """.trimIndent(),
        )
            .param("id", adminId)
            .query(String::class.java)
            .list()
            .mapNotNull { name -> name?.let { runCatching { AdminPermission.valueOf(it) }.getOrNull() } }
            .toSet()

    /** Returns the admin's id when they hold [anyOf] (or SUPER_ADMIN); otherwise 403. */
    fun require(jwt: Jwt, vararg anyOf: AdminPermission): UUID {
        val id = jwt.accountId()
        val held = permissions(id)
        if (AdminPermission.SUPER_ADMIN in held || anyOf.any { it in held }) return id
        throw ApiException(HttpStatus.FORBIDDEN, "You do not have access to this")
    }
}
