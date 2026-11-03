package com.tailorae.identity

import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import com.tailorae.common.Outbox
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

object IdentityTopics {
    const val EMAIL_VERIFICATION_REQUESTED = "identity.email-verification.requested"
    const val PASSWORD_RESET_REQUESTED = "identity.password-reset.requested"
    const val PHONE_OTP_REQUESTED = "identity.phone-otp.requested"

    val ALL = listOf(EMAIL_VERIFICATION_REQUESTED, PASSWORD_RESET_REQUESTED, PHONE_OTP_REQUESTED)
}

/** Carries the one-time secret to the notification module, which emails or texts it. */
data class AccountTokenIssued(val realm: String, val accountId: UUID, val email: String, val name: String, val token: String, val expiresInMinutes: Long)

data class PhoneOtpIssued(val realm: String, val accountId: UUID, val phone: String, val code: String, val expiresInMinutes: Long)

data class SessionView(val id: UUID, val userAgent: String?, val ip: String?, val createdAt: Instant, val expiresAt: Instant, val current: Boolean)

/**
 * Everything about an account's credentials after sign-up, for all three
 * realms: password reset and change, email confirmation, the seller's phone
 * code, and the list of signed-in devices.
 */
@Service
class AccountSecurity(
    private val jdbc: JdbcClient,
    private val passwords: PasswordEncoder,
    private val sessions: AuthSessionRepository,
    private val outbox: Outbox,
) {
    private val random = SecureRandom()

    private data class Account(val id: UUID, val email: String, val name: String, val phone: String?, val status: String)

    // ================================================================ password reset

    /** Always answers the same way, so it cannot be used to find out who has an account. */
    @Transactional
    fun requestPasswordReset(realm: Realm, email: String, ip: String?) {
        val account = byEmail(realm, email) ?: return
        if (account.status != "ACTIVE") return
        // One email a minute per account is plenty; more is someone hammering the form.
        if (recentlyIssued(realm, account.id, "PASSWORD_RESET", Duration.ofMinutes(1))) return
        val token = issue(realm, account.id, "PASSWORD_RESET", RESET_TTL, ip)
        outbox.record(IdentityTopics.PASSWORD_RESET_REQUESTED, account.id.toString(),
            AccountTokenIssued(realm.audience, account.id, account.email, account.name, token, RESET_TTL.toMinutes()))
    }

    /** Sets the new password and signs the account out everywhere. */
    @Transactional
    fun resetPassword(realm: Realm, token: String, newPassword: String) {
        PasswordPolicy.check(newPassword)
        val accountId = redeem(realm, token, "PASSWORD_RESET")
            ?: throw BadRequestException("This reset link has expired or has already been used. Please request a new one.")
        setPassword(realm, accountId, newPassword)
        sessions.revokeAllFor(realm.audience, accountId, Instant.now())
        // A working reset link also proves the inbox, and ends any lockout.
        jdbc.sql("update ${realm.table} set failed_attempts = 0, locked_until = null${if (realm != Realm.ADMIN) ", email_verified_at = coalesce(email_verified_at, now())" else ""} where id = :id")
            .param("id", accountId).update()
    }

    /** Needs the current password; other devices are signed out, this one stays. */
    @Transactional
    fun changePassword(realm: Realm, accountId: UUID, sessionFamily: UUID?, current: String, next: String) {
        val hash = jdbc.sql("select password_hash from ${realm.table} where id = :id").param("id", accountId).query(String::class.java).single()
        if (!passwords.matches(current, hash)) throw BadRequestException("Your current password is not right")
        if (current == next) throw BadRequestException("Choose a password you have not used here")
        PasswordPolicy.check(next)
        setPassword(realm, accountId, next)
        jdbc.sql("update auth_session set revoked_at = now() where realm = :r and account_id = :a and revoked_at is null and family_id is distinct from :f")
            .param("r", realm.audience).param("a", accountId).param("f", sessionFamily).update()
    }

    // ================================================================ email confirmation

    @Transactional
    fun sendEmailVerification(realm: Realm, accountId: UUID) {
        require(realm != Realm.ADMIN) { "Staff accounts are created verified" }
        val account = byId(realm, accountId) ?: throw NotFoundException("Account not found")
        val verified = jdbc.sql("select email_verified_at is not null from ${realm.table} where id = :id").param("id", accountId).query(Boolean::class.javaObjectType).single()
        if (verified) throw ConflictException("Your email address is already confirmed")
        if (recentlyIssued(realm, accountId, "EMAIL_VERIFICATION", Duration.ofMinutes(1))) throw ConflictException("We just sent one — check your inbox, or try again in a minute")
        val token = issue(realm, accountId, "EMAIL_VERIFICATION", VERIFY_TTL, null)
        outbox.record(IdentityTopics.EMAIL_VERIFICATION_REQUESTED, accountId.toString(),
            AccountTokenIssued(realm.audience, accountId, account.email, account.name, token, VERIFY_TTL.toMinutes()))
    }

    /** "verified", "already" or "invalid" — the web app shows a message for each. */
    @Transactional
    fun verifyEmail(realm: Realm, token: String): String {
        val accountId = redeem(realm, token, "EMAIL_VERIFICATION") ?: return "invalid"
        val updated = jdbc.sql("update ${realm.table} set email_verified_at = now(), updated_at = now() where id = :id and email_verified_at is null")
            .param("id", accountId).update()
        return if (updated == 1) "verified" else "already"
    }

    // ================================================================ seller phone code

    @Transactional
    fun sendPhoneCode(accountId: UUID) {
        val account = byId(Realm.SELLER, accountId) ?: throw NotFoundException("Account not found")
        if (recentlyIssued(Realm.SELLER, accountId, "PHONE_OTP", Duration.ofSeconds(30))) throw ConflictException("Wait a moment before asking for another code")
        val code = (random.nextInt(900_000) + 100_000).toString()
        insertToken(Realm.SELLER, accountId, "PHONE_OTP", hash("$accountId:$code"), OTP_TTL, null)
        outbox.record(IdentityTopics.PHONE_OTP_REQUESTED, accountId.toString(), PhoneOtpIssued("seller", accountId, account.phone!!, code, OTP_TTL.toMinutes()))
    }

    /** Five wrong guesses burn the code. */
    @Transactional(noRollbackFor = [BadRequestException::class])
    fun verifyPhone(accountId: UUID, code: String) {
        val latest = jdbc.sql(
            """
            select id, token_hash, attempts from auth_token
            where realm = 'seller' and account_id = :a and purpose = 'PHONE_OTP' and used_at is null and expires_at > now()
            order by created_at desc limit 1
            """.trimIndent(),
        ).param("a", accountId).query { rs, _ -> Triple(rs.getObject("id", UUID::class.java), rs.getString("token_hash"), rs.getInt("attempts")) }
            .optional().orElseThrow { BadRequestException("That code has expired — ask for a new one") }
        if (latest.third >= 5) throw BadRequestException("Too many wrong codes — ask for a new one")
        if (!MessageDigest.isEqual(latest.second.toByteArray(), hash("$accountId:${code.trim()}").toByteArray())) {
            jdbc.sql("update auth_token set attempts = attempts + 1 where id = :id").param("id", latest.first).update()
            throw BadRequestException("That code is not right")
        }
        jdbc.sql("update auth_token set used_at = now() where id = :id").param("id", latest.first).update()
        jdbc.sql("update seller_account set phone_verified_at = now(), updated_at = now() where id = :id").param("id", accountId).update()
    }

    fun verification(realm: Realm, accountId: UUID): Map<String, Boolean> = when (realm) {
        Realm.SELLER -> jdbc.sql("select email_verified_at is not null as e, phone_verified_at is not null as p from seller_account where id = :id")
            .param("id", accountId).query { rs, _ -> mapOf("email" to rs.getBoolean("e"), "phone" to rs.getBoolean("p")) }.single()
        Realm.CUSTOMER -> jdbc.sql("select email_verified_at is not null from customer where id = :id").param("id", accountId)
            .query(Boolean::class.javaObjectType).single().let { mapOf("email" to it) }
        Realm.ADMIN -> mapOf("email" to true)
    }

    // ================================================================ devices

    fun sessions(realm: Realm, accountId: UUID, currentFamily: UUID?): List<SessionView> =
        jdbc.sql(
            """
            select distinct on (family_id) family_id, user_agent, ip, created_at, expires_at from auth_session
            where realm = :r and account_id = :a and revoked_at is null and expires_at > now()
            order by family_id, created_at desc
            """.trimIndent(),
        ).param("r", realm.audience).param("a", accountId).query { rs, _ ->
            val family = rs.getObject("family_id", UUID::class.java)
            SessionView(family, rs.getString("user_agent"), rs.getString("ip"), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(), family == currentFamily)
        }.list().sortedByDescending { it.createdAt }

    /** Signs one device out (a session is identified by its family). */
    @Transactional
    fun revokeSession(realm: Realm, accountId: UUID, familyId: UUID) {
        val n = jdbc.sql("update auth_session set revoked_at = now() where realm = :r and account_id = :a and family_id = :f and revoked_at is null")
            .param("r", realm.audience).param("a", accountId).param("f", familyId).update()
        if (n == 0) throw NotFoundException("Session not found")
    }

    @Transactional
    fun revokeOthers(realm: Realm, accountId: UUID, currentFamily: UUID?): Int =
        jdbc.sql("update auth_session set revoked_at = now() where realm = :r and account_id = :a and revoked_at is null and family_id is distinct from :f")
            .param("r", realm.audience).param("a", accountId).param("f", currentFamily).update()

    // ================================================================ internals

    private fun setPassword(realm: Realm, accountId: UUID, password: String) {
        jdbc.sql("update ${realm.table} set password_hash = :h, updated_at = now() where id = :id")
            .param("h", passwords.encode(password)!!).param("id", accountId).update()
    }

    private fun issue(realm: Realm, accountId: UUID, purpose: String, ttl: Duration, ip: String?): String {
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
        // A new link replaces any older one still unused.
        jdbc.sql("update auth_token set used_at = now() where realm = :r and account_id = :a and purpose = :p and used_at is null")
            .param("r", realm.audience).param("a", accountId).param("p", purpose).update()
        insertToken(realm, accountId, purpose, hash(token), ttl, ip)
        return token
    }

    private fun insertToken(realm: Realm, accountId: UUID, purpose: String, tokenHash: String, ttl: Duration, ip: String?) {
        jdbc.sql("insert into auth_token (id, realm, account_id, purpose, token_hash, expires_at, requested_ip) values (:id, :r, :a, :p, :h, :exp, :ip)")
            .param("id", Ids.newId()).param("r", realm.audience).param("a", accountId).param("p", purpose).param("h", tokenHash)
            .param("exp", Timestamp.from(Instant.now().plus(ttl))).param("ip", ip).update()
    }

    /** Marks the token used and returns its account, or null if it is unknown, used, expired, or for another realm. */
    private fun redeem(realm: Realm, token: String, purpose: String): UUID? {
        if (token.isBlank() || token.length > 100) return null
        return jdbc.sql(
            """
            update auth_token set used_at = now()
            where token_hash = :h and realm = :r and purpose = :p and used_at is null and expires_at > now()
            returning account_id
            """.trimIndent(),
        ).param("h", hash(token.trim())).param("r", realm.audience).param("p", purpose).query(UUID::class.java).optional().orElse(null)
    }

    private fun recentlyIssued(realm: Realm, accountId: UUID, purpose: String, within: Duration): Boolean =
        jdbc.sql("select exists (select 1 from auth_token where realm = :r and account_id = :a and purpose = :p and created_at > :since)")
            .param("r", realm.audience).param("a", accountId).param("p", purpose).param("since", Timestamp.from(Instant.now().minus(within)))
            .query(Boolean::class.javaObjectType).single()

    private fun byEmail(realm: Realm, email: String): Account? = account(realm, "lower(email) = lower(:v)", email.trim())

    private fun byId(realm: Realm, id: UUID): Account? = account(realm, "id = :v", id)

    private fun account(realm: Realm, where: String, value: Any): Account? {
        val nameExpr = when (realm) {
            Realm.CUSTOMER -> "trim(first_name || ' ' || last_name)"
            else -> "full_name"
        }
        val phoneExpr = if (realm == Realm.ADMIN) "null::text" else "phone"
        return jdbc.sql("select id, email, $nameExpr as name, $phoneExpr as phone, status from ${realm.table} where $where")
            .param("v", value).query { rs, _ ->
                Account(rs.getObject("id", UUID::class.java), rs.getString("email"), rs.getString("name"), rs.getString("phone"), rs.getString("status"))
            }.optional().orElse(null)
    }

    private fun hash(token: String) = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.toByteArray()))

    companion object {
        val RESET_TTL: Duration = Duration.ofMinutes(30)
        val VERIFY_TTL: Duration = Duration.ofDays(2)
        val OTP_TTL: Duration = Duration.ofMinutes(10)
    }
}
