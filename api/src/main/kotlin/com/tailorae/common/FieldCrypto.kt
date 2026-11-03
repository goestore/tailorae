package com.tailorae.common

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

@ConfigurationProperties("tailorae.crypto")
data class CryptoProperties(
    /** 32 bytes, base64. Required in production; a bank account number must never be stored in clear. */
    val fieldKey: String = "",
)

/**
 * AES-256-GCM for individual columns that must not sit in clear text (bank
 * account numbers). Output is `v1:` + base64(iv ‖ ciphertext ‖ tag); the version
 * prefix leaves room to rotate keys later.
 */
@Component
class FieldCrypto(props: CryptoProperties) {
    private val key: SecretKeySpec? = props.fieldKey.takeIf { it.isNotBlank() }?.let {
        val bytes = Base64.getDecoder().decode(it)
        require(bytes.size == 32) { "tailorae.crypto.field-key must be 32 bytes, base64-encoded" }
        SecretKeySpec(bytes, "AES")
    }
    private val random = SecureRandom()

    fun encrypt(plain: String): String {
        val k = key ?: throw IllegalStateException("tailorae.crypto.field-key is not configured")
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, k, GCMParameterSpec(128, iv)) }
        return "v1:" + Base64.getEncoder().encodeToString(iv + cipher.doFinal(plain.toByteArray()))
    }

    fun decrypt(stored: String): String {
        val k = key ?: throw IllegalStateException("tailorae.crypto.field-key is not configured")
        require(stored.startsWith("v1:")) { "Unknown ciphertext version" }
        val bytes = Base64.getDecoder().decode(stored.removePrefix("v1:"))
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, k, GCMParameterSpec(128, bytes, 0, 12))
        }
        return String(cipher.doFinal(bytes, 12, bytes.size - 12))
    }

    companion object {
        /** `XXXXXX1234` — what staff and the seller see once the number is saved. */
        fun mask(number: String): String =
            if (number.length <= 4) "•".repeat(number.length) else "•".repeat(number.length - 4) + number.takeLast(4)
    }
}
