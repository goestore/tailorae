package com.tailorae

import org.springframework.modulith.core.ApplicationModules
import kotlin.test.Test

/** Fails the build when one module reaches into another's internals. */
class ModularityTest {
    @Test
    fun `module boundaries hold`() {
        ApplicationModules.of(TailoraeApplication::class.java).verify()
    }
}
