package com.tailorae.finance

import com.tailorae.common.SingleRunner
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * Credits sellers for orders that cleared the return window. Replaces the
 * legacy "sync on read": balances are right even when nobody looks.
 */
@Component
class FinanceJobs(private val runner: SingleRunner, private val finance: FinanceService) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(cron = "\${tailorae.jobs.settlement-cron:0 15 2 * * *}", zone = "Asia/Kolkata")
    fun settlementSweep() {
        val credited = runner.run("settlement-sweep") { finance.syncSales(null) } ?: return
        log.info("Settlement sweep credited {} seller order(s)", credited)
    }
}
