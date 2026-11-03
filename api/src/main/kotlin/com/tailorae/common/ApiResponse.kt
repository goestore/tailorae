package com.tailorae.common

/**
 * The response envelope every endpoint returns — the same `{ success, message,
 * data }` shape the Node API uses, so the web app's client keeps working when
 * it is pointed here.
 */
data class ApiResponse<T>(
    val success: Boolean,
    val message: String,
    val data: T? = null,
) {
    companion object {
        fun <T> ok(data: T, message: String = "OK") = ApiResponse(true, message, data)
        fun fail(message: String) = ApiResponse<Unit>(false, message, null)
    }
}
