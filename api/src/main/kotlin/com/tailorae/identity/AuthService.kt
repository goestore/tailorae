package com.tailorae.identity

import com.tailorae.common.ApiException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.Outbox
import com.tailorae.common.Topics
import com.tailorae.common.UnauthorizedException
import org.springframework.http.HttpStatus
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Who is calling — kept on the session row so a user can see where they are signed in. */
data class ClientInfo(val userAgent: String?, val ip: String?)

data class AccountSummary(
    val id: UUID,
    val realm: String,
    val email: String,
    val name: String,
    val emailVerified: Boolean,
)

data class AuthResult(val account: AccountSummary, val tokens: IssuedTokens)

data class CustomerRegistered(val customerId: UUID, val email: String, val firstName: String)

data class SellerRegistered(val accountId: UUID, val email: String, val fullName: String)

@Service
class AuthService(
    private val customers: CustomerRepository,
    private val sellers: SellerAccountRepository,
    private val admins: AdminUserRepository,
    private val sessions: AuthSessionRepository,
    private val tokens: TokenService,
    private val passwords: PasswordEncoder,
    private val outbox: Outbox,
    private val props: AuthProperties,
    private val security: AccountSecurity,
) {
    // Hashing a dummy on unknown emails keeps "no such account" and "wrong
    // password" the same speed, so response time cannot be used to find accounts.
    private val dummyHash: String by lazy { passwords.encode("timing-equaliser-not-a-password")!! }

    // ------------------------------------------------------------ registration

    @Transactional
    fun registerCustomer(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        phone: String?,
        marketingOptIn: Boolean,
        client: ClientInfo,
    ): AuthResult {
        PasswordPolicy.check(password)
        val normalised = email.trim().lowercase()
        if (customers.findByEmailIgnoreCase(normalised) != null) {
            throw ConflictException("An account with this email already exists — sign in instead")
        }
        // Flushed now: the confirmation token below is written with plain SQL.
        val customer = customers.saveAndFlush(
            Customer(
                id = Ids.newId(),
                email = normalised,
                phone = phone?.trim()?.ifEmpty { null },
                passwordHash = passwords.encode(password)!!,
                firstName = firstName.trim(),
                lastName = lastName.trim(),
                marketingOptIn = marketingOptIn,
            ),
        )
        outbox.record(
            Topics.CUSTOMER_REGISTERED,
            customer.id.toString(),
            CustomerRegistered(customer.id, customer.email, customer.firstName),
        )
        security.sendEmailVerification(Realm.CUSTOMER, customer.id)
        return AuthResult(summary(Realm.CUSTOMER, customer), startSession(Realm.CUSTOMER, customer.id, client))
    }

    @Transactional
    fun registerSeller(email: String, password: String, fullName: String, phone: String, client: ClientInfo): AuthResult {
        PasswordPolicy.check(password)
        val normalised = email.trim().lowercase()
        val normalisedPhone = phone.trim()
        if (sellers.findByEmailIgnoreCase(normalised) != null) {
            throw ConflictException("A seller account with this email already exists — sign in instead")
        }
        if (sellers.existsByPhone(normalisedPhone)) {
            throw ConflictException("A seller account with this phone number already exists")
        }
        val account = sellers.saveAndFlush(
            SellerAccount(
                id = Ids.newId(),
                email = normalised,
                phone = normalisedPhone,
                passwordHash = passwords.encode(password)!!,
                fullName = fullName.trim(),
            ),
        )
        outbox.record(
            Topics.SELLER_REGISTERED,
            account.id.toString(),
            SellerRegistered(account.id, account.email, account.fullName),
        )
        security.sendEmailVerification(Realm.SELLER, account.id)
        return AuthResult(summary(Realm.SELLER, account), startSession(Realm.SELLER, account.id, client))
    }

    // ------------------------------------------------------------ sign in / out

    /**
     * Not [Transactional] as a whole: a failed attempt must still be counted
     * when the method then throws, so the counter is saved in its own write.
     */
    fun login(realm: Realm, email: String, password: String, client: ClientInfo): AuthResult {
        val account = find(realm, email)
        if (account == null) {
            passwords.matches(password, dummyHash)
            throw invalidCredentials()
        }
        val now = Instant.now()
        account.lockedUntil?.let { until ->
            if (until.isAfter(now)) {
                val minutes = Duration.between(now, until).toMinutes() + 1
                throw ApiException(HttpStatus.LOCKED, "Too many attempts. Try again in $minutes minute${if (minutes == 1L) "" else "s"}.")
            }
        }
        if (!passwords.matches(password, account.passwordHash)) {
            account.failedAttempts += 1
            if (account.failedAttempts >= props.maxFailedAttempts) {
                account.failedAttempts = 0
                account.lockedUntil = now.plus(props.lockDuration)
            }
            account.updatedAt = now
            save(realm, account)
            throw invalidCredentials()
        }
        if (account.status != "ACTIVE") {
            throw ApiException(HttpStatus.FORBIDDEN, "This account is not active. Contact support.")
        }
        account.failedAttempts = 0
        account.lockedUntil = null
        account.updatedAt = now
        save(realm, account)
        return AuthResult(summary(realm, account), startSession(realm, account.id, client))
    }

    /**
     * Rotates the refresh token. Presenting a token that was already rotated
     * means two parties hold it — the legitimate client and a thief — so the
     * whole session family is revoked and both must sign in again.
     */
    @Transactional(noRollbackFor = [UnauthorizedException::class])
    fun refresh(realm: Realm, refreshToken: String, client: ClientInfo): AuthResult {
        val now = Instant.now()
        val current = sessions.findByRefreshHash(tokens.hash(refreshToken))
            ?.takeIf { it.realm == realm.audience }
            ?: throw UnauthorizedException("Your session has ended — please sign in again")
        if (current.revokedAt != null) {
            if (current.replacedBy != null) sessions.revokeFamily(current.familyId, now)
            throw UnauthorizedException("Your session has ended — please sign in again")
        }
        if (current.expiresAt.isBefore(now)) throw UnauthorizedException("Your session has expired — please sign in again")

        val account = findById(realm, current.accountId)
            ?.takeIf { it.status == "ACTIVE" }
            ?: throw UnauthorizedException("This account is not active")

        val next = newSession(realm, account.id, current.familyId, client)
        current.revokedAt = now
        current.replacedBy = next.first.id
        return AuthResult(summary(realm, account), next.second)
    }

    @Transactional
    fun logout(realm: Realm, refreshToken: String?) {
        val session = refreshToken?.let { sessions.findByRefreshHash(tokens.hash(it)) } ?: return
        if (session.realm == realm.audience) sessions.revokeFamily(session.familyId, Instant.now())
    }

    @Transactional(readOnly = true)
    fun me(realm: Realm, accountId: UUID): AccountSummary =
        findById(realm, accountId)?.let { summary(realm, it) } ?: throw UnauthorizedException()

    // ------------------------------------------------------------ internals

    private fun startSession(realm: Realm, accountId: UUID, client: ClientInfo): IssuedTokens =
        newSession(realm, accountId, Ids.newId(), client).second

    private fun newSession(realm: Realm, accountId: UUID, familyId: UUID, client: ClientInfo): Pair<AuthSession, IssuedTokens> {
        val refresh = tokens.newRefreshToken()
        val session = sessions.save(
            AuthSession(
                id = Ids.newId(),
                realm = realm.audience,
                accountId = accountId,
                familyId = familyId,
                refreshHash = tokens.hash(refresh),
                expiresAt = Instant.now().plus(props.refreshTtl),
                userAgent = client.userAgent?.take(300),
                ip = client.ip,
            ),
        )
        return session to IssuedTokens(tokens.accessToken(realm, accountId, familyId), refresh)
    }

    private fun find(realm: Realm, email: String): RealmAccount? = when (realm) {
        Realm.CUSTOMER -> customers.findByEmailIgnoreCase(email.trim())
        Realm.SELLER -> sellers.findByEmailIgnoreCase(email.trim())
        Realm.ADMIN -> admins.findByEmailIgnoreCase(email.trim())
    }

    private fun findById(realm: Realm, id: UUID): RealmAccount? = when (realm) {
        Realm.CUSTOMER -> customers.findById(id).orElse(null)
        Realm.SELLER -> sellers.findById(id).orElse(null)
        Realm.ADMIN -> admins.findById(id).orElse(null)
    }

    private fun save(realm: Realm, account: RealmAccount) {
        when (realm) {
            Realm.CUSTOMER -> customers.save(account as Customer)
            Realm.SELLER -> sellers.save(account as SellerAccount)
            Realm.ADMIN -> admins.save(account as AdminUser)
        }
    }

    private fun summary(realm: Realm, account: RealmAccount) = when (account) {
        is Customer -> AccountSummary(account.id, realm.audience, account.email, "${account.firstName} ${account.lastName}".trim(), account.emailVerifiedAt != null)
        is SellerAccount -> AccountSummary(account.id, realm.audience, account.email, account.fullName, account.emailVerifiedAt != null)
        is AdminUser -> AccountSummary(account.id, realm.audience, account.email, account.fullName, true)
        else -> error("Unknown account type")
    }

    private fun invalidCredentials() = UnauthorizedException("Email or password is incorrect")
}
