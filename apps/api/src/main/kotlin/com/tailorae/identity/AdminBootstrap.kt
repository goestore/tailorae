package com.tailorae.identity

import com.tailorae.common.Ids
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Creates the first SUPER_ADMIN from configuration, once — only while the
 * admin table is empty, so changing the env later never resets a password.
 */
@Component
class AdminBootstrap(
    private val admins: AdminUserRepository,
    private val passwords: PasswordEncoder,
    private val jdbc: JdbcClient,
    private val props: AuthProperties,
) : ApplicationRunner {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    override fun run(args: ApplicationArguments) {
        val email = props.bootstrapAdminEmail?.trim()?.lowercase()
        val password = props.bootstrapAdminPassword
        if (email.isNullOrEmpty() || password.isNullOrEmpty() || admins.count() > 0) return
        PasswordPolicy.check(password)
        // Flushed now: the permission row below is plain JDBC and needs the admin row to exist.
        val admin = admins.saveAndFlush(
            AdminUser(id = Ids.newId(), email = email, passwordHash = passwords.encode(password)!!, fullName = "Administrator"),
        )
        jdbc.sql("insert into admin_permission (admin_id, permission) values (:id, 'SUPER_ADMIN')")
            .param("id", admin.id)
            .update()
        log.info("Created bootstrap SUPER_ADMIN {}", email)
    }
}
