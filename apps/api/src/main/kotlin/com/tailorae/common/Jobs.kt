package com.tailorae.common

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate

/**
 * Runs a scheduled job on one API instance at a time: the body executes only
 * if this transaction wins a Postgres advisory lock named after the job, and
 * the lock ends with the transaction. No extra table, no extra library.
 */
@Component
class SingleRunner(private val jdbc: JdbcClient, private val tx: TransactionTemplate) {
    /** Returns the body's result, or null when another instance holds the job. */
    fun <T> run(job: String, body: () -> T): T? = tx.execute {
        val won = jdbc.sql("select pg_try_advisory_xact_lock(hashtext(:k))").param("k", "job:$job").query(Boolean::class.javaObjectType).single()
        if (won) body() else null
    }
}
