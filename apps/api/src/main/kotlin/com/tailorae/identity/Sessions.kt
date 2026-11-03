package com.tailorae.identity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "auth_session")
class AuthSession(
    @Id val id: UUID,
    val realm: String,
    @Column(name = "account_id") val accountId: UUID,
    @Column(name = "family_id") val familyId: UUID,
    @Column(name = "refresh_hash") val refreshHash: String,
    @Column(name = "expires_at") val expiresAt: Instant,
    @Column(name = "revoked_at") var revokedAt: Instant? = null,
    @Column(name = "replaced_by") var replacedBy: UUID? = null,
    @Column(name = "user_agent") val userAgent: String? = null,
    val ip: String? = null,
    @Column(name = "created_at") val createdAt: Instant = Instant.now(),
)

interface AuthSessionRepository : JpaRepository<AuthSession, UUID> {
    fun findByRefreshHash(refreshHash: String): AuthSession?

    @Modifying
    @Query("update AuthSession s set s.revokedAt = :now where s.familyId = :familyId and s.revokedAt is null")
    fun revokeFamily(familyId: UUID, now: Instant): Int

    @Modifying
    @Query("update AuthSession s set s.revokedAt = :now where s.realm = :realm and s.accountId = :accountId and s.revokedAt is null")
    fun revokeAllFor(realm: String, accountId: UUID, now: Instant): Int
}
