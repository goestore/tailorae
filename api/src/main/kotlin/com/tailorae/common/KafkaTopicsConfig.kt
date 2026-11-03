package com.tailorae.common

import org.apache.kafka.clients.admin.NewTopic
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.config.TopicBuilder
import org.springframework.kafka.core.KafkaAdmin

/**
 * Topics are declared by the modules that own them (a [TopicSet] bean each) and
 * created here at startup; the broker has auto-creation switched off, so a
 * misspelt topic fails loudly.
 */
@Configuration
class KafkaTopicsConfig {
    @Bean
    fun coreTopics() = TopicSet(Topics.ALL)

    @Bean
    fun topics(sets: List<TopicSet>): KafkaAdmin.NewTopics = KafkaAdmin.NewTopics(
        *sets.flatMap { it.names }.distinct().flatMap { name ->
            listOf<NewTopic>(
                TopicBuilder.name(name).partitions(3).replicas(1).build(),
                // Dead letters for events a consumer could not handle after retries.
                TopicBuilder.name("$name.DLT").partitions(1).replicas(1).build(),
            )
        }.toTypedArray(),
    )
}
