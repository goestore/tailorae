package com.tailorae.identity

import com.tailorae.common.BadRequestException
import kotlin.test.Test
import kotlin.test.assertFailsWith

class PasswordPolicyTest {
    @Test
    fun `accepts a long passphrase`() = PasswordPolicy.check("linen kurta in saffron")

    @Test
    fun `rejects short, common and repetitive passwords`() {
        assertFailsWith<BadRequestException> { PasswordPolicy.check("short1") }
        assertFailsWith<BadRequestException> { PasswordPolicy.check("password123") }
        assertFailsWith<BadRequestException> { PasswordPolicy.check("aaaaaaaaaaaa") }
    }
}
