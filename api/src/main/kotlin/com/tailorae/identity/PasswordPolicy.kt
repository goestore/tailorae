package com.tailorae.identity

import com.tailorae.common.BadRequestException

/**
 * Length beats composition rules: at least 10 characters, and not one of the
 * passwords every credential-stuffing list tries first.
 */
object PasswordPolicy {
    private val COMMON = setOf(
        "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop",
        "iloveyou123", "letmein123", "welcome123", "admin12345", "abcdefghij", "0987654321",
        "tailorae123", "qwerty1234", "1q2w3e4r5t",
    )

    fun check(password: String) {
        if (password.length < 10) throw BadRequestException("Password must be at least 10 characters")
        if (password.length > 128) throw BadRequestException("Password must be at most 128 characters")
        if (password.lowercase() in COMMON || password.toSet().size < 4) {
            throw BadRequestException("That password is too easy to guess — try a longer phrase")
        }
    }
}
