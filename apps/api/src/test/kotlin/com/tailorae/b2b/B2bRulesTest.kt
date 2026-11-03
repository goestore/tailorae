package com.tailorae.b2b

import tools.jackson.databind.json.JsonMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class B2bRulesTest {
    private val json = JsonMapper.builder().build()
    private fun pick(body: String) = B2bRules.pickProfile(json.readTree(body))

    // PAN AAPFU0939F and a GSTIN that embeds it (check digit valid), as in the seller KYC tests.
    private val pan = "AAPFU0939F"
    private val gstin = "27AAPFU0939F1ZV"

    @Test
    fun `profile fields are whitelisted, trimmed and normalised`() {
        val picked = pick(
            """{"companyName": " Loom Co ", "panNumber": "aapfu 0939f", "website": "  ", "monthlyBudgetPaise": 5000000,
               "isVerified": true, "creditLimitPaise": 999}""",
        )
        assertEquals(emptyList(), picked.errors)
        assertEquals(mapOf("companyName" to "Loom Co", "panNumber" to pan, "website" to null, "monthlyBudgetPaise" to 5_000_000L), picked.values)
    }

    @Test
    fun `invalid identity and numbers are refused with readable messages`() {
        val picked = pick("""{"companyName": "", "panNumber": "12345", "gstNumber": "27AAPFU0939F1ZX", "employeeCount": 2.5, "monthlyBudgetPaise": -1}""")
        assertEquals(
            listOf(
                "Company name cannot be empty", "PAN must look like ABCDE1234F", "GSTIN is not valid. Check for a typo",
                "Monthly budget must be a whole number of paise, zero or more", "Employee count must be a whole number",
            ),
            picked.errors,
        )
    }

    @Test
    fun `GSTIN must embed the PAN when both are on file`() {
        assertTrue(B2bRules.gstinMatchesPan(pan, gstin))
        assertFalse(B2bRules.gstinMatchesPan("ABCDE1234F", gstin))
        assertTrue(B2bRules.gstinMatchesPan(null, gstin))
        assertTrue(B2bRules.gstinMatchesPan(pan, null))
    }

    @Test
    fun `changing company identity voids verification, other fields do not`() {
        val current = mapOf("companyName" to "Loom Co", "gstNumber" to gstin, "panNumber" to pan)
        assertTrue(B2bRules.voidsVerification(true, current, mapOf("companyName" to "Loom Company")))
        assertTrue(B2bRules.voidsVerification(true, current, mapOf("gstNumber" to null)))
        assertFalse(B2bRules.voidsVerification(true, current, mapOf("companyName" to "Loom Co", "website" to "x")))
        assertFalse(B2bRules.voidsVerification(false, current, mapOf("companyName" to "Other")))
    }

    @Test
    fun `the most specific quantity break sets the unit price`() {
        val tiers = listOf(B2bRules.Tier(10, 49, 900), B2bRules.Tier(50, null, 800), B2bRules.Tier(100, 499, 700))
        assertEquals(1000, B2bRules.unitPrice(5, 1000, tiers))
        assertEquals(900, B2bRules.unitPrice(10, 1000, tiers))
        assertEquals(800, B2bRules.unitPrice(60, 1000, tiers))
        assertEquals(700, B2bRules.unitPrice(150, 1000, tiers))
        assertEquals(800, B2bRules.unitPrice(600, 1000, tiers))
    }

    @Test
    fun `credit draws stay within the limit and payments within the balance`() {
        assertEquals(30_000, B2bRules.applyCredit("CREDIT_ISSUED", 30_000, 0, 50_000).getOrThrow())
        assertTrue(B2bRules.applyCredit("CREDIT_ISSUED", 30_000, 30_000, 50_000).exceptionOrNull() is IllegalStateException)
        assertEquals(10_000, B2bRules.applyCredit("PAYMENT_RECEIVED", 20_000, 30_000, 50_000).getOrThrow())
        assertTrue(B2bRules.applyCredit("PAYMENT_RECEIVED", 40_000, 30_000, 50_000).exceptionOrNull() is IllegalStateException)
        assertEquals(25_000, B2bRules.applyCredit("ADJUSTMENT", -5_000, 30_000, 50_000).getOrThrow())
        assertTrue(B2bRules.applyCredit("ADJUSTMENT", -40_000, 30_000, 50_000).isFailure)
        assertTrue(B2bRules.applyCredit("CREDIT_ISSUED", 0, 0, 50_000).exceptionOrNull() is IllegalArgumentException)
        assertTrue(B2bRules.applyCredit("GIFT", 10, 0, 50_000).isFailure)
        assertEquals(-20_000, B2bRules.signedAmount("PAYMENT_RECEIVED", 20_000))
    }

    @Test
    fun `numbers and dates keep the legacy formats`() {
        assertTrue(Regex("^RFQ-1730620800000-[A-HJ-NP-Z2-9]{4}$").matches(B2bRules.number("RFQ", 1_730_620_800_000)))
        assertEquals(java.time.Instant.parse("2026-12-01T00:00:00Z"), B2bRules.parseDate("2026-12-01"))
        assertEquals(java.time.Instant.parse("2026-12-01T05:30:00Z"), B2bRules.parseDate("2026-12-01T11:00:00+05:30"))
        assertNull(B2bRules.parseDate("next tuesday"))
    }
}
