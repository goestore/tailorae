package com.tailorae.common

/**
 * Money is integer paise everywhere — never a floating-point rupee amount,
 * which cannot represent ₹0.10 exactly and drifts when split between sellers.
 */
@JvmInline
value class Paise(val value: Long) : Comparable<Paise> {
    operator fun plus(other: Paise) = Paise(value + other.value)
    operator fun minus(other: Paise) = Paise(value - other.value)
    override fun compareTo(other: Paise) = value.compareTo(other.value)

    /** `rate` in basis points (1000 = 10%), rounded half-up to the paisa. */
    fun percentBp(rateBp: Int): Paise = Paise(Math.floorDiv(value * rateBp + 5_000, 10_000))

    override fun toString(): String = "₹%d.%02d".format(value / 100, Math.abs(value % 100))

    companion object {
        val ZERO = Paise(0)
        fun ofRupees(rupees: Long) = Paise(rupees * 100)
    }
}
