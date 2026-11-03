package com.tailorae.common

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper

/**
 * Platform-wide settings staff can change without a deploy (commission
 * default, settlement hold, shipping fees, whether seller sign-ups are open).
 * Values are JSON; every key has a default in the V2 migration.
 */
@Component
class SystemSettings(private val jdbc: JdbcClient, private val json: JsonMapper) {

    fun raw(key: String): String? =
        jdbc.sql("select value::text from system_setting where key = :k").param("k", key).query(String::class.java).optional().orElse(null)

    fun <T : Any> get(key: String, type: Class<T>, default: T): T =
        raw(key)?.let { runCatching { json.readValue(it, type) }.getOrNull() } ?: default

    fun bool(key: String, default: Boolean) = get(key, Boolean::class.javaObjectType, default)

    fun long(key: String, default: Long) = get(key, Long::class.javaObjectType, default)

    fun int(key: String, default: Int) = get(key, Int::class.javaObjectType, default)

    fun all(): Map<String, Any?> =
        jdbc.sql("select key, value::text as value from system_setting order by key")
            .query { rs, _ -> rs.getString("key") to json.readValue(rs.getString("value"), Any::class.java) }
            .list().toMap()

    fun set(key: String, value: Any?) {
        jdbc.sql(
            """
            insert into system_setting (key, value, updated_at) values (:k, cast(:v as jsonb), now())
            on conflict (key) do update set value = excluded.value, updated_at = now()
            """.trimIndent(),
        ).param("k", key).param("v", json.writeValueAsString(value)).update()
    }

    companion object {
        const val SELLER_APPLICATIONS_OPEN = "seller.applications_open"
        const val DEFAULT_COMMISSION_BP = "commission.default_rate_bp"
        const val SETTLEMENT_HOLD_DAYS = "settlement.hold_days"
        const val FREE_SHIPPING_ABOVE_PAISE = "shipping.free_above_paise"
        const val FLAT_SHIPPING_PAISE = "shipping.flat_paise"
    }
}
