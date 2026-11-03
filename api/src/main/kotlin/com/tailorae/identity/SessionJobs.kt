package com.tailorae.identity

import com.tailorae.common.SingleRunner
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/** Drops sessions that can no longer be used: expired, or revoked over a month ago. */
@Component
class SessionJobs(private val runner: SingleRunner, private val jdbc: JdbcClient) {
    @Scheduled(cron = "\${tailorae.jobs.session-cleanup-cron:0 30 3 * * *}", zone = "Asia/Kolkata")
    fun cleanup() {
        runner.run("session-cleanup") {
            jdbc.sql("delete from auth_session where expires_at < now() or revoked_at < now() - interval '30 days'").update()
        }
    }
}
