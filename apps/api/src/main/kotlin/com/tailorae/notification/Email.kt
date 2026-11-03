package com.tailorae.notification

/** A rendered message: the same content as plain text and as branded HTML. */
data class Email(val subject: String, val text: String, val html: String)

/**
 * A tiny template system. A message is a list of blocks written once; [render]
 * turns it into both the text and the HTML part, so the two can never say
 * different things.
 *
 * House style (web/src/app/globals.css): TAILORAE gold `#FECC00` used sparingly
 * — the wordmark and the one call to action — on black and white, in the
 * Inter-like system font stack.
 */
sealed interface EmailBlock {
    data class Heading(val text: String) : EmailBlock
    data class Paragraph(val text: String) : EmailBlock
    data class Button(val label: String, val url: String) : EmailBlock
    /** Label/value rows: order numbers, totals, references. */
    data class Facts(val rows: List<Pair<String, String>>) : EmailBlock
    /** A bulleted list of lines (order items, quote lines). */
    data class Items(val lines: List<String>) : EmailBlock
    /** Quoted text from a person (a reviewer's note). */
    data class Quote(val text: String) : EmailBlock
    /** Small print under a rule: why you received this. */
    data class Small(val text: String) : EmailBlock
}

class EmailBuilder internal constructor() {
    internal val blocks = mutableListOf<EmailBlock>()
    internal var preheader: String? = null

    /** Inbox preview text; hidden in the body. */
    fun preheader(text: String) { preheader = text }
    fun heading(text: String) { blocks += EmailBlock.Heading(text) }
    fun paragraph(text: String) { blocks += EmailBlock.Paragraph(text) }
    fun button(label: String, url: String) { blocks += EmailBlock.Button(label, url) }
    fun facts(vararg rows: Pair<String, String?>) {
        val present = rows.mapNotNull { (k, v) -> v?.takeIf { it.isNotBlank() }?.let { k to it } }
        if (present.isNotEmpty()) blocks += EmailBlock.Facts(present)
    }
    fun items(lines: List<String>) { if (lines.isNotEmpty()) blocks += EmailBlock.Items(lines) }
    fun quote(text: String?) { text?.takeIf { it.isNotBlank() }?.let { blocks += EmailBlock.Quote(it.trim()) } }
    fun small(text: String) { blocks += EmailBlock.Small(text) }
}

fun email(subject: String, signOff: String = "TAILORAE", build: EmailBuilder.() -> Unit): Email {
    val builder = EmailBuilder().apply(build)
    return Email(
        subject = subject,
        text = EmailRenderer.text(builder.blocks, signOff),
        html = EmailRenderer.html(subject, builder.preheader, builder.blocks, signOff),
    )
}

internal object EmailRenderer {
    const val GOLD = "#FECC00"
    const val INK = "#0A0A0A"
    const val MUTED = "#5C5C5C"
    const val RULE = "#E6E6E6"
    const val FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

    fun text(blocks: List<EmailBlock>, signOff: String): String = buildString {
        for (block in blocks) {
            when (block) {
                is EmailBlock.Heading -> append(block.text)
                is EmailBlock.Paragraph -> append(block.text)
                is EmailBlock.Button -> append("${block.label}: ${block.url}")
                is EmailBlock.Facts -> append(block.rows.joinToString("\n") { (k, v) -> "$k: $v" })
                is EmailBlock.Items -> append(block.lines.joinToString("\n") { "  - $it" })
                is EmailBlock.Quote -> append(block.text.lines().joinToString("\n") { "> $it" })
                is EmailBlock.Small -> append("--\n${block.text}")
            }
            append("\n\n")
        }
        append("— $signOff")
    }.trimEnd() + "\n"

    fun html(title: String, preheader: String?, blocks: List<EmailBlock>, signOff: String): String {
        val body = blocks.joinToString("\n") { block(it) }
        val hidden = preheader?.let {
            """<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(it)}</div>"""
        } ?: ""
        return """
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light">
            <title>${esc(title)}</title>
            </head>
            <body style="margin:0;padding:0;background:#F5F5F5;font-family:$FONT;color:$INK">
            $hidden
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 12px">
            <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid $RULE;border-radius:12px;overflow:hidden">
            <tr><td style="background:$INK;padding:20px 28px">
            <span style="font-family:$FONT;font-size:20px;font-weight:800;letter-spacing:0.18em;color:$GOLD">TAILORAE</span>
            </td></tr>
            <tr><td style="padding:28px 28px 8px 28px;font-family:$FONT;font-size:15px;line-height:1.6;color:$INK">
            $body
            <p style="margin:24px 0 0 0;color:$MUTED">— ${esc(signOff)}</p>
            </td></tr>
            <tr><td style="padding:16px 28px 24px 28px;font-family:$FONT;font-size:12px;line-height:1.5;color:$MUTED">
            TAILORAE · Clothing from independent sellers and brands
            </td></tr>
            </table>
            </td></tr>
            </table>
            </body>
            </html>
        """.trimIndent()
    }

    private fun block(block: EmailBlock): String = when (block) {
        is EmailBlock.Heading ->
            """<h1 style="margin:0 0 16px 0;font-family:$FONT;font-size:22px;line-height:1.3;font-weight:700;color:$INK">${esc(block.text)}</h1>"""
        is EmailBlock.Paragraph ->
            """<p style="margin:0 0 16px 0">${multiline(block.text)}</p>"""
        is EmailBlock.Button ->
            """<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0"><tr><td style="background:$GOLD;border-radius:8px">""" +
                """<a href="${attr(block.url)}" style="display:inline-block;padding:12px 22px;font-family:$FONT;font-size:15px;font-weight:700;color:$INK;text-decoration:none">${esc(block.label)}</a>""" +
                """</td></tr></table>""" +
                """<p style="margin:0 0 16px 0;font-size:12px;color:$MUTED;word-break:break-all">${esc(block.url)}</p>"""
        is EmailBlock.Facts ->
            """<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border-top:1px solid $RULE">""" +
                block.rows.joinToString("") { (k, v) ->
                    """<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid $RULE;color:$MUTED;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td>""" +
                        """<td style="padding:8px 0;border-bottom:1px solid $RULE;font-size:14px;font-weight:600;text-align:right">${multiline(v)}</td></tr>"""
                } + "</table>"
        is EmailBlock.Items ->
            """<ul style="margin:0 0 16px 0;padding-left:20px">""" +
                block.lines.joinToString("") { """<li style="margin:0 0 6px 0">${esc(it)}</li>""" } + "</ul>"
        is EmailBlock.Quote ->
            """<blockquote style="margin:0 0 16px 0;padding:12px 16px;border-left:3px solid $GOLD;background:#FAFAFA;color:$INK">${multiline(block.text)}</blockquote>"""
        is EmailBlock.Small ->
            """<p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid $RULE;font-size:12px;color:$MUTED">${multiline(block.text)}</p>"""
    }

    fun esc(s: String): String = buildString(s.length) {
        for (c in s) when (c) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&#39;")
            else -> append(c)
        }
    }

    private fun multiline(s: String) = esc(s).replace("\n", "<br>")

    /** Only http(s) links are ever rendered as a link target. */
    private fun attr(url: String) = esc(if (url.startsWith("https://") || url.startsWith("http://")) url else "#")
}
