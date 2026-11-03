package com.tailorae.notification

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** One order line as the receipt shows it. */
data class OrderMailLine(val name: String, val quantity: Int, val lineTotalPaise: Long)

data class OrderMailAddress(
    val fullName: String,
    val line1: String,
    val line2: String? = null,
    val city: String,
    val state: String,
    val postalCode: String,
)

data class OrderMail(
    val orderId: String,
    val orderNumber: String,
    val firstName: String?,
    val lines: List<OrderMailLine>,
    val subtotalPaise: Long,
    val discountPaise: Long = 0,
    val discountCode: String? = null,
    val shippingPaise: Long,
    val totalPaise: Long,
    val address: OrderMailAddress? = null,
)

/** One custom-wear quote line in the acknowledgement. */
data class QuoteMailLine(
    val reference: String,
    val productName: String,
    val sku: String,
    val quantity: Int,
    val colorName: String?,
    val sizes: List<String>,
)

/**
 * Every message the store sends, ported from legacy-api `services/notifications.ts`
 * and the seller/custom-wear flows. Pure functions of their inputs: callers
 * (Kafka consumers) look the data up and decide the recipient.
 */
object EmailTemplates {

    // ================================================================ orders

    /**
     * Customer-facing wording per order status. Statuses the shopper does not
     * need a mail about are absent — a mail for every internal step trains people
     * to ignore all of them.
     */
    private val STATUS_MAIL: Map<String, Pair<String, String>> = mapOf(
        "CONFIRMED" to ("Your order is confirmed" to "We have confirmed your order and it is going into production or packing now."),
        "PROCESSING" to ("Your order is being prepared" to "Your order is being picked and packed. We will send tracking as soon as it ships."),
        "SHIPPED" to ("Your order has shipped" to "Your parcel is on its way."),
        "DELIVERED" to ("Your order has been delivered" to "Your parcel has been delivered. If anything is not right, you have 7 days to raise a return."),
        "CANCELLED" to ("Your order has been cancelled" to "This order has been cancelled. Any payment already made is refunded to the original method."),
        "RETURNED" to ("We have your return" to "Your return has reached us and is going through its quality check."),
    )

    fun orderConfirmation(order: OrderMail, webUrl: String): Email =
        email("Order ${order.orderNumber} confirmed") {
            preheader("Thanks for your order — here is what it contains.")
            heading("Thanks for your order")
            paragraph("Hi ${order.firstName?.takeIf { it.isNotBlank() } ?: order.address?.fullName ?: "there"}, we have it, and this is what it contains.")
            facts("Order number" to order.orderNumber)
            items(order.lines.map { "${it.name} × ${it.quantity} — ${rupees(it.lineTotalPaise)}" })
            facts(
                "Subtotal" to rupees(order.subtotalPaise),
                (if (order.discountCode != null) "Discount (${order.discountCode})" else "Discount") to
                    (if (order.discountPaise > 0) "-${rupees(order.discountPaise)}" else null),
                "Shipping" to (if (order.shippingPaise == 0L) "Free" else rupees(order.shippingPaise)),
                "Total" to rupees(order.totalPaise),
            )
            order.address?.let { a ->
                facts(
                    "Delivering to" to listOfNotNull(
                        a.fullName,
                        a.line1 + (a.line2?.takeIf { it.isNotBlank() }?.let { ", $it" } ?: ""),
                        "${a.city}, ${a.state} ${a.postalCode}",
                    ).joinToString("\n"),
                )
            }
            button("Track your order", "$webUrl/track-order?order=${url(order.orderNumber)}")
            paragraph("Your invoice: $webUrl/invoice/${order.orderId}")
        }

    /** Null for statuses the customer is not mailed about. */
    fun orderStatusUpdate(
        orderNumber: String,
        firstName: String?,
        status: String,
        webUrl: String,
        carrier: String? = null,
        trackingNumber: String? = null,
    ): Email? {
        val (subject, line) = STATUS_MAIL[status] ?: return null
        return email("$subject — $orderNumber") {
            heading(subject)
            paragraph("Hi ${firstName?.takeIf { it.isNotBlank() } ?: "there"},")
            paragraph(line)
            facts(
                "Order number" to orderNumber,
                "Tracking" to trackingNumber?.let { listOfNotNull(carrier, it).joinToString(" ") },
            )
            button("Track it", "$webUrl/track-order?order=${url(orderNumber)}")
        }
    }

    // ================================================================ stock

    fun backInStock(productName: String, size: String?, productUrl: String): Email =
        email("Back in stock: $productName") {
            preheader("$productName is available again.")
            heading("It's back")
            paragraph("$productName${size?.let { " in $it" } ?: ""} is available again.")
            paragraph("You asked us to tell you when it came back, so here we are. Stock on a restock does not usually last, and we cannot hold it for you.")
            button("Shop it now", productUrl)
            small("You received this because you asked to be told about this one item. It is not a subscription and there is nothing to unsubscribe from.")
        }

    // ================================================================ account

    fun passwordReset(firstName: String?, resetUrl: String, expiresInMinutes: Int): Email =
        email("Reset your password") {
            heading("Reset your password")
            paragraph("Hi ${firstName?.takeIf { it.isNotBlank() } ?: "there"},")
            paragraph("Someone asked to reset the password on the TAILORAE account registered to this address. If that was you, follow this link and choose a new one:")
            button("Choose a new password", resetUrl)
            paragraph("The link works once and stops working in $expiresInMinutes minutes.")
            small("If it was not you, you do not need to do anything. Your password has not changed and nobody can change it without this link.")
        }

    fun emailVerification(firstName: String?, verifyUrl: String, expiresInDays: Int): Email =
        email("Confirm your email address") {
            heading("Confirm your email address")
            paragraph("Hi ${firstName?.takeIf { it.isNotBlank() } ?: "there"},")
            paragraph("Welcome to TAILORAE. Confirm this is your address so we can send you order updates and let you recover the account if you ever lose the password:")
            button("Confirm my address", verifyUrl)
            paragraph("The link works once and stops working in $expiresInDays days.")
            small("You can shop and place orders in the meantime — this only confirms where we should write to you.")
        }

    /** Carries no link on purpose: a "suspicious change" mail asking you to click is the shape of the attack it warns about. */
    fun passwordChanged(firstName: String?, changedAt: Instant): Email =
        email("Your password was changed") {
            heading("Your password was changed")
            paragraph("Hi ${firstName?.takeIf { it.isNotBlank() } ?: "there"},")
            paragraph("The password on your TAILORAE account was changed on ${DateTimeFormatter.RFC_1123_DATE_TIME.format(changedAt.atOffset(ZoneOffset.UTC))}.")
            paragraph("If that was you, there is nothing to do — this is only a record.")
            paragraph("If it was not, contact us straight away and do not use any link in this message to do it. Go to the site the way you normally would and use the contact page there.")
        }

    // ================================================================ sellers

    fun sellerApplicationSubmitted(shopName: String, ownerEmail: String, reviewUrl: String): Email =
        email("New seller application: $shopName", signOff = "TAILORAE Seller Ops") {
            preheader("$shopName is waiting for KYC review.")
            heading("A shop is waiting for review")
            paragraph("$shopName has submitted its seller application. Check the business details, KYC documents and bank account, then approve, reject or ask for more information.")
            facts("Shop" to shopName, "Owner" to ownerEmail)
            button("Review the application", reviewUrl)
        }

    /** Null for a status the seller is not mailed about (under review is not a decision). */
    fun sellerApplicationDecided(shopName: String, status: String, note: String?, consoleUrl: String): Email? {
        val signOff = "TAILORAE Seller Support"
        return when (status) {
            "APPROVED" -> email("$shopName is approved on TAILORAE", signOff) {
                preheader("You can start listing products now.")
                heading("You're approved")
                paragraph("Good news — $shopName is approved. You can now list products, and they appear in the store once they pass moderation.")
                quote(note)
                button("Open your seller console", consoleUrl)
            }
            "NEEDS_INFO" -> email("We need a little more from $shopName", signOff) {
                preheader("Your application needs a change before we can approve it.")
                heading("One more step")
                paragraph("We reviewed the application for $shopName and need something changed or added before we can approve it:")
                quote(note)
                paragraph("Update your details or documents, then submit again.")
                button("Update your application", consoleUrl)
            }
            "REJECTED" -> email("Your TAILORAE seller application", signOff) {
                heading("We could not approve $shopName")
                paragraph("Thank you for applying. We were not able to approve this application:")
                quote(note)
                paragraph("If you think this is a mistake, reply to this email and we will take another look.")
            }
            "SUSPENDED" -> email("$shopName is suspended", signOff) {
                heading("Your shop is suspended")
                paragraph("$shopName has been suspended, so its products are hidden from the store for now:")
                quote(note)
                paragraph("Reply to this email to resolve it.")
                button("Open your seller console", consoleUrl)
            }
            else -> null
        }
    }

    fun sellerMemberInvited(shopName: String, role: String, inviteUrl: String): Email =
        email("You're invited to join $shopName on TAILORAE", signOff = "TAILORAE Seller Support") {
            preheader("Accept the invite to start working in the seller console.")
            heading("Join $shopName")
            paragraph("You have been invited to help run $shopName on TAILORAE as ${roleLabel(role)}.")
            button("Accept the invite", inviteUrl)
            paragraph("Sign in or create a seller account with this email address to accept. The invite expires in 7 days.")
            small("Not expecting this? You can ignore it — nothing happens unless you accept.")
        }

    // ================================================================ custom wear

    fun customWearQuoteReceived(customerName: String, lines: List<QuoteMailLine>, statusUrl: String): Email {
        val first = lines.first().reference
        val more = if (lines.size > 1) " (+${lines.size - 1})" else ""
        return email("We received your custom wear request — $first$more") {
            preheader("Our team will reply with pricing, lead times and a digital proof.")
            heading("Request received")
            paragraph("Hi $customerName,")
            paragraph("Thanks for your custom wear request. Our team will reply with pricing, lead times and a digital proof.")
            items(lines.map(::quoteLine))
            button("Check the status", statusUrl)
        }
    }

    fun customWearQuoteForStaff(
        contactLine: String,
        location: String,
        requiredBy: String?,
        lines: List<QuoteMailLine>,
        artworkCount: Int,
        reviewUrl: String,
    ): Email = email("New custom wear quote request — ${lines.joinToString(", ") { it.reference }}") {
        heading("New custom wear request")
        facts("From" to contactLine, "Where" to location, "Needed by" to requiredBy, "Artwork" to "$artworkCount file(s)")
        items(lines.map(::quoteLine))
        button("Review in the admin", reviewUrl)
    }

    // ================================================================ helpers

    private fun quoteLine(q: QuoteMailLine) =
        "${q.reference} — ${q.productName} (${q.sku}) × ${q.quantity}" +
            (q.colorName?.let { ", $it" } ?: "") +
            (if (q.sizes.isNotEmpty()) ", sizes ${q.sizes.joinToString("/")}" else "")

    private fun roleLabel(role: String) = when (role) {
        "MANAGER" -> "a manager"
        "CATALOG" -> "a catalogue editor"
        "FULFILMENT" -> "fulfilment staff"
        "FINANCE" -> "finance staff"
        else -> role.lowercase()
    }

    /** `₹1,23,456.00` — Indian digit grouping, always two decimals. */
    fun rupees(paise: Long): String {
        val sign = if (paise < 0) "-" else ""
        val abs = Math.abs(paise)
        val whole = (abs / 100).toString()
        // Last three digits, then pairs: 12,34,567. Integer maths — no floating-point rupees.
        val grouped = if (whole.length <= 3) whole else {
            val head = whole.dropLast(3)
            head.reversed().chunked(2).joinToString(",").reversed() + "," + whole.takeLast(3)
        }
        return "$sign₹$grouped.%02d".format(abs % 100)
    }

    private fun url(s: String) = java.net.URLEncoder.encode(s, Charsets.UTF_8)
}
