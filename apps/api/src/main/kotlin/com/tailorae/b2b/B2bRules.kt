package com.tailorae.b2b

import com.tailorae.seller.Kyc
import tools.jackson.databind.JsonNode
import java.security.SecureRandom
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset

/**
 * Wholesale rules, ported from legacy-api `routes/b2b.ts` and `admin-b2b.ts`.
 * Pure functions, so the rules are unit-tested without a database.
 */
object B2bRules {
    val RFQ_STATUSES = listOf("PENDING", "QUOTED", "ACCEPTED", "REJECTED", "EXPIRED")
    val BULK_STATUSES = listOf("PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED")
    val CREDIT_TYPES = listOf("CREDIT_ISSUED", "PAYMENT_RECEIVED", "ADJUSTMENT")

    const val MAX_RFQ_QUANTITY = 1_000_000
    const val MAX_TEXT = 2000
    const val DEFAULT_QUOTE_DAYS = 14L

    /** businessType is required by the schema; a one-step RFQ does not ask for it. */
    const val UNSPECIFIED_BUSINESS_TYPE = "Unspecified"

    /** Fields whose change voids staff verification: it was of the old details. */
    val IDENTITY_FIELDS = setOf("companyName", "gstNumber", "panNumber")

    /** API field → column of `customer_business_profile`. The map is the whitelist. */
    val PROFILE_COLUMNS = mapOf(
        "companyName" to "company_name",
        "businessType" to "business_type",
        "companyRegistration" to "company_registration",
        "businessCategory" to "business_category",
        "businessDescription" to "description",
        "website" to "website",
        "panNumber" to "pan",
        "gstNumber" to "gstin",
        "monthlyBudgetPaise" to "monthly_budget_paise",
        "employeeCount" to "employee_count",
    )

    private val LABEL = mapOf(
        "companyName" to "Company name",
        "businessType" to "Business type",
        "companyRegistration" to "Company registration number",
        "businessCategory" to "Business category",
        "businessDescription" to "Business description",
        "website" to "Website",
    )

    private val random = SecureRandom()
    private const val SUFFIX_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    data class Picked(val values: Map<String, Any?>, val errors: List<String>)

    /**
     * Whitelist + validate profile fields. A field left out is unchanged; null
     * (or blank) clears an optional one. Credit, tier and verification are staff-only.
     */
    fun pickProfile(body: JsonNode?): Picked {
        val values = linkedMapOf<String, Any?>()
        val errors = mutableListOf<String>()
        if (body == null || !body.isObject) return Picked(values, listOf("Send the profile as a JSON object"))

        for (field in listOf("companyName", "businessType")) {
            val v = body.get(field) ?: continue
            val text = v.takeIf { it.isString }?.asString()?.trim()
            when {
                text.isNullOrEmpty() -> errors += "${LABEL[field]} cannot be empty"
                text.length > 120 -> errors += "${LABEL[field]} must be 120 characters or fewer"
                else -> values[field] = text
            }
        }
        for (field in listOf("companyRegistration", "businessCategory", "businessDescription", "website")) {
            val v = body.get(field) ?: continue
            if (!v.isNull && !v.isString) {
                errors += "${LABEL[field]} must be text"
                continue
            }
            val trimmed = if (v.isString) v.asString().trim() else ""
            if (trimmed.length > MAX_TEXT) errors += "${LABEL[field]} is too long" else values[field] = trimmed.ifEmpty { null }
        }
        body.get("panNumber")?.let { v ->
            val pan = Kyc.normalise(v.takeIf { it.isString }?.asString())
            if (pan.isNotEmpty() && !Kyc.isValidPan(pan)) errors += "PAN must look like ABCDE1234F" else values["panNumber"] = pan.ifEmpty { null }
        }
        body.get("gstNumber")?.let { v ->
            val gstin = Kyc.normalise(v.takeIf { it.isString }?.asString())
            if (gstin.isNotEmpty() && !Kyc.isValidGstin(gstin)) errors += "GSTIN is not valid. Check for a typo" else values["gstNumber"] = gstin.ifEmpty { null }
        }
        body.get("monthlyBudgetPaise")?.let { v ->
            when {
                v.isNull || (v.isString && v.asString().isBlank()) -> values["monthlyBudgetPaise"] = null
                v.isIntegralNumber && v.asLong() >= 0 -> values["monthlyBudgetPaise"] = v.asLong()
                else -> errors += "Monthly budget must be a whole number of paise, zero or more"
            }
        }
        body.get("employeeCount")?.let { v ->
            when {
                v.isNull || (v.isString && v.asString().isBlank()) -> values["employeeCount"] = null
                v.isIntegralNumber && v.asLong() in 0..Int.MAX_VALUE -> values["employeeCount"] = v.asInt()
                else -> errors += "Employee count must be a whole number"
            }
        }
        return Picked(values, errors)
    }

    /** When both are on file, the GSTIN must embed the PAN (characters 3–12). */
    fun gstinMatchesPan(pan: String?, gstin: String?): Boolean =
        pan.isNullOrEmpty() || gstin.isNullOrEmpty() || !Kyc.isValidGstin(gstin) || gstin.substring(2, 12) == pan

    /** Whether saving [changes] over [current] should put a verified profile back to unverified. */
    fun voidsVerification(isVerified: Boolean, current: Map<String, Any?>, changes: Map<String, Any?>): Boolean =
        isVerified && IDENTITY_FIELDS.any { it in changes && changes[it] != current[it] }

    /** `RFQ-1730620800000-K7QX` — the legacy number format. */
    fun number(prefix: String, nowMillis: Long = System.currentTimeMillis()): String =
        "$prefix-$nowMillis-" + (1..4).map { SUFFIX_CHARS[random.nextInt(SUFFIX_CHARS.length)] }.joinToString("")

    /** ISO instant, offset date-time or a calendar date (midnight UTC). */
    fun parseDate(raw: String): Instant? {
        val s = raw.trim()
        return runCatching { Instant.parse(s) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(s).toInstant() }.getOrNull()
            ?: runCatching { LocalDate.parse(s).atStartOfDay().toInstant(ZoneOffset.UTC) }.getOrNull()
    }

    data class Tier(val minQty: Int, val maxQty: Int?, val pricePaise: Long)

    /** The unit price for [quantity]: the most specific matching quantity break, else the list price. */
    fun unitPrice(quantity: Int, listPricePaise: Long, tiers: List<Tier>): Long =
        tiers.filter { quantity >= it.minQty && (it.maxQty == null || quantity <= it.maxQty) }
            .maxByOrNull { it.minQty }?.pricePaise ?: listPricePaise

    /**
     * The credit used after a ledger entry, or the reason it is refused.
     * CREDIT_ISSUED draws credit (+), PAYMENT_RECEIVED repays it (−), ADJUSTMENT is signed.
     */
    fun applyCredit(type: String, amountPaise: Long, usedPaise: Long, limitPaise: Long): Result<Long> {
        val next = when (type) {
            "CREDIT_ISSUED" -> {
                if (amountPaise <= 0) return Result.failure(IllegalArgumentException("Amount must be more than zero"))
                usedPaise + amountPaise
            }
            "PAYMENT_RECEIVED" -> {
                if (amountPaise <= 0) return Result.failure(IllegalArgumentException("Amount must be more than zero"))
                if (amountPaise > usedPaise) return Result.failure(IllegalStateException("That payment is more than the outstanding balance"))
                usedPaise - amountPaise
            }
            "ADJUSTMENT" -> {
                if (amountPaise == 0L) return Result.failure(IllegalArgumentException("An adjustment cannot be zero"))
                usedPaise + amountPaise
            }
            else -> return Result.failure(IllegalArgumentException("type must be one of ${CREDIT_TYPES.joinToString(", ")}"))
        }
        if (next < 0) return Result.failure(IllegalStateException("The outstanding balance cannot go below zero"))
        if (type == "CREDIT_ISSUED" && next > limitPaise) return Result.failure(IllegalStateException("That would exceed the credit limit"))
        return Result.success(next)
    }

    /** The signed change to credit used, as stored on the ledger row. */
    fun signedAmount(type: String, amountPaise: Long) = if (type == "PAYMENT_RECEIVED") -amountPaise else amountPaise
}
