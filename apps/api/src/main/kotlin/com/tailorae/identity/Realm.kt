package com.tailorae.identity

/**
 * The three separate identity realms (docs/ACCOUNTS.md). Each has its own
 * accounts table, its own auth endpoints under [authPath], its own cookies, and
 * tokens whose `aud` claim is [audience] — a token from one realm is rejected by
 * every other realm's endpoints.
 */
enum class Realm(val audience: String, val accessCookie: String, val authPath: String, val apiPrefix: String, val table: String) {
    CUSTOMER("customer", "tl_c", "/api/auth", "/api", "customer"),
    SELLER("seller", "tl_s", "/api/seller/auth", "/api/seller", "seller_account"),
    ADMIN("admin", "tl_a", "/api/admin/auth", "/api/admin", "admin_user");

    /** The refresh cookie is only ever sent to its own realm's auth endpoints. */
    val refreshCookie: String get() = "${accessCookie}_r"
}
