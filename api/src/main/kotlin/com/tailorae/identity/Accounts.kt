package com.tailorae.identity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.time.Instant
import java.util.UUID

/** What sign-in needs from an account, whichever realm it lives in. */
interface RealmAccount {
    val id: UUID
    val email: String
    var passwordHash: String
    var status: String
    var failedAttempts: Int
    var lockedUntil: Instant?
    var updatedAt: Instant
}

@Entity
@Table(name = "customer")
class Customer(
    @Id override val id: UUID,
    override val email: String,
    var phone: String?,
    @Column(name = "password_hash") override var passwordHash: String,
    @Column(name = "first_name") var firstName: String,
    @Column(name = "last_name") var lastName: String,
    var type: String = "INDIVIDUAL",
    override var status: String = "ACTIVE",
    @Column(name = "email_verified_at") var emailVerifiedAt: Instant? = null,
    @Column(name = "marketing_opt_in") var marketingOptIn: Boolean = false,
    @Column(name = "failed_attempts") override var failedAttempts: Int = 0,
    @Column(name = "locked_until") override var lockedUntil: Instant? = null,
    @Column(name = "created_at") val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at") override var updatedAt: Instant = Instant.now(),
) : RealmAccount

@Entity
@Table(name = "seller_account")
class SellerAccount(
    @Id override val id: UUID,
    override val email: String,
    var phone: String,
    @Column(name = "password_hash") override var passwordHash: String,
    @Column(name = "full_name") var fullName: String,
    override var status: String = "ACTIVE",
    @Column(name = "email_verified_at") var emailVerifiedAt: Instant? = null,
    @Column(name = "phone_verified_at") var phoneVerifiedAt: Instant? = null,
    @Column(name = "failed_attempts") override var failedAttempts: Int = 0,
    @Column(name = "locked_until") override var lockedUntil: Instant? = null,
    @Column(name = "created_at") val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at") override var updatedAt: Instant = Instant.now(),
) : RealmAccount

@Entity
@Table(name = "admin_user")
class AdminUser(
    @Id override val id: UUID,
    override val email: String,
    @Column(name = "password_hash") override var passwordHash: String,
    @Column(name = "full_name") var fullName: String,
    override var status: String = "ACTIVE",
    @Column(name = "failed_attempts") override var failedAttempts: Int = 0,
    @Column(name = "locked_until") override var lockedUntil: Instant? = null,
    @Column(name = "created_at") val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at") override var updatedAt: Instant = Instant.now(),
) : RealmAccount

interface CustomerRepository : JpaRepository<Customer, UUID> {
    @Query("select c from Customer c where lower(c.email) = lower(:email)")
    fun findByEmailIgnoreCase(email: String): Customer?
}

interface SellerAccountRepository : JpaRepository<SellerAccount, UUID> {
    @Query("select s from SellerAccount s where lower(s.email) = lower(:email)")
    fun findByEmailIgnoreCase(email: String): SellerAccount?

    fun existsByPhone(phone: String): Boolean
}

interface AdminUserRepository : JpaRepository<AdminUser, UUID> {
    @Query("select a from AdminUser a where lower(a.email) = lower(:email)")
    fun findByEmailIgnoreCase(email: String): AdminUser?
}
