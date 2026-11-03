package com.tailorae.seller

/**
 * Indian business identifiers. Shape checks plus the GSTIN check digit, so a
 * typo is caught at entry rather than by a reviewer days later.
 */
object Kyc {
    private val pan = Regex("^[A-Z]{5}[0-9]{4}[A-Z]$")
    private val gstin = Regex("^\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
    private val ifsc = Regex("^[A-Z]{4}0[A-Z0-9]{6}$")
    private const val BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    fun normalise(value: String?): String = value?.replace(Regex("\\s+"), "")?.uppercase().orEmpty()

    fun isValidPan(value: String?) = pan.matches(normalise(value))

    fun isValidIfsc(value: String?) = ifsc.matches(normalise(value))

    fun gstinCheckChar(first14: String): Char {
        var sum = 0
        for (i in 0 until 14) {
            val product = BASE36.indexOf(first14[i]) * (if (i % 2 == 0) 1 else 2)
            sum += product / 36 + product % 36
        }
        return BASE36[(36 - sum % 36) % 36]
    }

    fun isValidGstin(value: String?): Boolean {
        val g = normalise(value)
        if (!gstin.matches(g)) return false
        val state = g.substring(0, 2).toInt()
        if (state < 1 || (state > 38 && state != 97 && state != 99)) return false
        return gstinCheckChar(g.substring(0, 14)) == g[14]
    }

    data class Result(val pan: String?, val gstin: String?, val errors: List<String>)

    /** PAN is required; GSTIN is optional but, when given, must be valid and embed that PAN. */
    fun validate(panInput: String?, gstinInput: String?): Result {
        val errors = mutableListOf<String>()
        val p = normalise(panInput)
        val g = normalise(gstinInput)
        if (p.isEmpty()) errors += "PAN is required"
        else if (!isValidPan(p)) errors += "PAN must look like ABCDE1234F"
        if (g.isNotEmpty()) {
            if (!isValidGstin(g)) errors += "GSTIN is not valid. Check for a typo"
            else if (p.isNotEmpty() && g.substring(2, 12) != p) errors += "GSTIN does not belong to this PAN"
        }
        return Result(p.ifEmpty { null }, g.ifEmpty { null }, errors)
    }
}
