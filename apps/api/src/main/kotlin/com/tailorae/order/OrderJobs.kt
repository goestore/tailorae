package com.tailorae.order

import com.tailorae.common.SingleRunner
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.UUID

/** Online orders nobody paid for give their stock back once the payment window closes. */
@Component
class OrderJobs(private val runner: SingleRunner, private val jdbc: JdbcClient, private val orders: OrderService) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${tailorae.jobs.unpaid-orders-ms:60000}", initialDelay = 30_000)
    fun releaseUnpaidOrders() {
        val released = runner.run("release-unpaid-orders") { releaseUnpaid() } ?: return
        if (released > 0) log.info("Released stock from {} unpaid order(s)", released)
    }

    fun releaseUnpaid(): Int {
        val due = jdbc.sql(
            """
            select id from customer_order
            where payment_method = 'RAZORPAY' and payment_status = 'PENDING' and status = 'PENDING' and payment_due_by < now()
            order by payment_due_by limit 100
            """.trimIndent(),
        ).query(UUID::class.java).list()
        due.filterNotNull().forEach { orders.cancel(it, "system", null, "Cancelled — payment was not completed in time") }
        return due.size
    }
}
