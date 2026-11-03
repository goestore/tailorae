package com.tailorae.common

import org.springframework.http.ResponseEntity

/**
 * A page of results. List endpoints return the items in the envelope and the
 * full count in `X-Total-Count`, which is what the web app's tables read.
 */
data class Page<T>(val items: List<T>, val total: Long, val page: Int, val limit: Int) {
    val pages: Int get() = if (limit == 0) 0 else ((total + limit - 1) / limit).toInt()

    fun <R> map(transform: (T) -> R) = Page(items.map(transform), total, page, limit)
}

/** `page` is 1-based; `limit` is clamped so a client cannot ask for the whole table. */
data class PageParams(val page: Int = 1, val limit: Int = 20) {
    val safePage: Int get() = page.coerceAtLeast(1)
    val safeLimit: Int get() = limit.coerceIn(1, MAX_LIMIT)
    val offset: Int get() = (safePage - 1) * safeLimit

    companion object {
        const val MAX_LIMIT = 100
    }
}

fun <T> Page<T>.toResponse(message: String = "OK"): ResponseEntity<ApiResponse<Page<T>>> =
    ResponseEntity.ok().header("X-Total-Count", total.toString()).body(ApiResponse.ok(this, message))
