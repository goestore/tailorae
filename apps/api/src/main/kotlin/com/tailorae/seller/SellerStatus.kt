package com.tailorae.seller

import com.tailorae.common.ConflictException

/** docs/ACCOUNTS.md, "Seller (a state machine on seller.status)". */
enum class SellerStatus { DRAFT, SUBMITTED, UNDER_REVIEW, NEEDS_INFO, APPROVED, REJECTED, SUSPENDED }

enum class SellerAction(val by: Actor) {
    SUBMIT(Actor.SELLER),
    START_REVIEW(Actor.STAFF),
    APPROVE(Actor.STAFF),
    REJECT(Actor.STAFF),
    REQUEST_INFO(Actor.STAFF),
    SUSPEND(Actor.STAFF),
    REINSTATE(Actor.STAFF);

    enum class Actor { SELLER, STAFF }
}

object SellerStatusMachine {
    private val transitions: Map<Pair<SellerStatus, SellerAction>, SellerStatus> = mapOf(
        (SellerStatus.DRAFT to SellerAction.SUBMIT) to SellerStatus.SUBMITTED,
        (SellerStatus.NEEDS_INFO to SellerAction.SUBMIT) to SellerStatus.SUBMITTED,
        (SellerStatus.SUBMITTED to SellerAction.START_REVIEW) to SellerStatus.UNDER_REVIEW,
        (SellerStatus.SUBMITTED to SellerAction.APPROVE) to SellerStatus.APPROVED,
        (SellerStatus.SUBMITTED to SellerAction.REJECT) to SellerStatus.REJECTED,
        (SellerStatus.SUBMITTED to SellerAction.REQUEST_INFO) to SellerStatus.NEEDS_INFO,
        (SellerStatus.UNDER_REVIEW to SellerAction.APPROVE) to SellerStatus.APPROVED,
        (SellerStatus.UNDER_REVIEW to SellerAction.REJECT) to SellerStatus.REJECTED,
        (SellerStatus.UNDER_REVIEW to SellerAction.REQUEST_INFO) to SellerStatus.NEEDS_INFO,
        (SellerStatus.APPROVED to SellerAction.SUSPEND) to SellerStatus.SUSPENDED,
        (SellerStatus.SUSPENDED to SellerAction.REINSTATE) to SellerStatus.APPROVED,
    )

    fun next(from: SellerStatus, action: SellerAction): SellerStatus =
        transitions[from to action]
            ?: throw ConflictException("A shop that is ${from.label()} cannot be ${action.label()}")

    fun allowed(from: SellerStatus): Set<SellerAction> =
        transitions.keys.filter { it.first == from }.map { it.second }.toSet()

    /** The fields a seller may still change; legal identity freezes once submitted. */
    fun businessEditable(status: SellerStatus) = status == SellerStatus.DRAFT || status == SellerStatus.NEEDS_INFO

    private fun SellerStatus.label() = name.lowercase().replace('_', ' ')

    private fun SellerAction.label() = when (this) {
        SellerAction.SUBMIT -> "submitted"
        SellerAction.START_REVIEW -> "put under review"
        SellerAction.APPROVE -> "approved"
        SellerAction.REJECT -> "rejected"
        SellerAction.REQUEST_INFO -> "sent back for more information"
        SellerAction.SUSPEND -> "suspended"
        SellerAction.REINSTATE -> "reinstated"
    }
}
