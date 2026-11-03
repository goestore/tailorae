package com.tailorae.common

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * Who changed what. Written in the same transaction as the change, so the log
 * can never claim something happened that rolled back.
 */
@Component
class Audit(private val jdbc: JdbcClient, private val json: JsonMapper) {

    @Transactional(propagation = Propagation.MANDATORY)
    fun record(
        actorRealm: String,
        actorId: UUID?,
        action: String,
        entity: String,
        entityId: String?,
        before: Any? = null,
        after: Any? = null,
    ) {
        jdbc.sql(
            """
            insert into audit_log (id, actor_realm, actor_id, action, entity, entity_id, before, after, created_at)
            values (:id, :realm, :actor, :action, :entity, :entityId, cast(:before as jsonb), cast(:after as jsonb), now())
            """.trimIndent(),
        )
            .param("id", Ids.newId())
            .param("realm", actorRealm)
            .param("actor", actorId)
            .param("action", action)
            .param("entity", entity)
            .param("entityId", entityId)
            .param("before", before?.let(json::writeValueAsString))
            .param("after", after?.let(json::writeValueAsString))
            .update()
    }
}
