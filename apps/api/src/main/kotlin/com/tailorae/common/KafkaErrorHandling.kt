package com.tailorae.common

import org.apache.kafka.common.TopicPartition
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.listener.CommonErrorHandler
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.util.backoff.ExponentialBackOff

/**
 * A listener that throws is retried with backoff (1s, 2s, 4s, …, up to ~30s in
 * total), then its record is published to `<topic>.DLT` and the partition moves
 * on — one poison message never blocks the events behind it.
 */
@Configuration
class KafkaErrorHandling {
    @Bean
    fun kafkaErrorHandler(template: KafkaTemplate<String, String>): CommonErrorHandler {
        val recoverer = DeadLetterPublishingRecoverer(template) { record, _ ->
            TopicPartition("${record.topic()}.DLT", 0)
        }
        val backOff = ExponentialBackOff(1_000, 2.0).apply { maxElapsedTime = 30_000 }
        return DefaultErrorHandler(recoverer, backOff)
    }
}
