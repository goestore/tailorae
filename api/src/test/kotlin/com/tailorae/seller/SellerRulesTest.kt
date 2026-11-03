package com.tailorae.seller

import com.tailorae.common.ConflictException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class KycTest {
    // A widely published sample GSTIN with a correct checksum.
    private val goodGstin = "27AAPFU0939F1ZV"

    @Test
    fun `accepts a real-shaped PAN and rejects others`() {
        assertTrue(Kyc.isValidPan("AAPFU0939F"))
        assertTrue(Kyc.isValidPan(" aapfu0939f "))
        assertFalse(Kyc.isValidPan("AAPF0939F"))
        assertFalse(Kyc.isValidPan("12345ABCDE"))
    }

    @Test
    fun `verifies the GSTIN checksum`() {
        assertEquals('V', Kyc.gstinCheckChar(goodGstin.take(14)))
        assertTrue(Kyc.isValidGstin(goodGstin))
        assertFalse(Kyc.isValidGstin("27AAPFU0939F1ZA"))
        assertFalse(Kyc.isValidGstin("00AAPFU0939F1ZV"))
    }

    @Test
    fun `checks IFSC shape`() {
        assertTrue(Kyc.isValidIfsc("HDFC0001234"))
        assertFalse(Kyc.isValidIfsc("HDFC1001234"))
    }

    @Test
    fun `requires PAN and ties GSTIN to it`() {
        assertTrue("PAN is required" in Kyc.validate(null, null).errors)
        assertEquals(emptyList(), Kyc.validate("AAPFU0939F", goodGstin).errors)
        assertTrue("GSTIN does not belong to this PAN" in Kyc.validate("ABCDE1234F", goodGstin).errors)
        val panOnly = Kyc.validate("AAPFU0939F", null)
        assertEquals(null, panOnly.gstin)
        assertEquals(emptyList(), panOnly.errors)
    }
}

class SellerStatusMachineTest {
    @Test
    fun `the happy path runs draft to approved`() {
        var s = SellerStatus.DRAFT
        s = SellerStatusMachine.next(s, SellerAction.SUBMIT)
        s = SellerStatusMachine.next(s, SellerAction.START_REVIEW)
        s = SellerStatusMachine.next(s, SellerAction.APPROVE)
        assertEquals(SellerStatus.APPROVED, s)
    }

    @Test
    fun `needs-info goes back to the seller and can be resubmitted`() {
        val back = SellerStatusMachine.next(SellerStatus.UNDER_REVIEW, SellerAction.REQUEST_INFO)
        assertEquals(SellerStatus.NEEDS_INFO, back)
        assertTrue(SellerStatusMachine.businessEditable(back))
        assertEquals(SellerStatus.SUBMITTED, SellerStatusMachine.next(back, SellerAction.SUBMIT))
    }

    @Test
    fun `suspension is reversible, rejection is final, drafts cannot be approved`() {
        assertEquals(SellerStatus.APPROVED, SellerStatusMachine.next(SellerStatus.SUSPENDED, SellerAction.REINSTATE))
        assertTrue(SellerStatusMachine.allowed(SellerStatus.REJECTED).isEmpty())
        assertThrows<ConflictException> { SellerStatusMachine.next(SellerStatus.DRAFT, SellerAction.APPROVE) }
        assertFalse(SellerStatusMachine.businessEditable(SellerStatus.SUBMITTED))
    }

    @Test
    fun `roles follow the permission matrix`() {
        val catalog = CurrentSeller(java.util.UUID.randomUUID(), java.util.UUID.randomUUID(), SellerRole.CATALOG, SellerStatus.APPROVED)
        assertTrue(catalog.can(SellerPermission.CATALOG))
        assertFalse(catalog.can(SellerPermission.FINANCE))
        assertFalse(catalog.can(SellerPermission.PROFILE))
        assertTrue(SellerPermission.FINANCE.roles == setOf(SellerRole.OWNER, SellerRole.FINANCE))
    }
}
