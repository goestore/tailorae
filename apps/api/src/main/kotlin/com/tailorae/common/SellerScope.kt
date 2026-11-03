package com.tailorae.common

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Postgres row-level security for seller-realm work (docs/ACCOUNTS.md, layer 3).
 *
 * [enter] switches the current transaction to the `tailorae_seller_scope` role
 * and sets `app.seller_id`. Every seller-owned table has a policy
 * `seller_id = current_setting('app.seller_id')::uuid` that applies to that role,
 * so even a query that forgot its `where seller_id = …` cannot read or write
 * another seller's rows. The role cannot read customer or staff tables at all.
 *
 * Both settings are `LOCAL`: they end with the transaction, so a pooled
 * connection never carries one seller's scope into the next request.
 *
 * Call it first thing inside a `@Transactional` seller-realm service method.
 * Storefront and admin work never enters it — they read across sellers.
 */
@Component
class SellerScope(private val jdbc: JdbcClient) {

    @Transactional(propagation = Propagation.MANDATORY)
    fun enter(sellerId: UUID) {
        jdbc.sql("set local role tailorae_seller_scope").update()
        jdbc.sql("select set_config('app.seller_id', :id, true)").param("id", sellerId.toString()).query().singleValue()
    }
}
