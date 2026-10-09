import nodemailer, { Transporter } from 'nodemailer';

/**
 * The one place that sends mail.
 *
 * There are no SMTP credentials on this project yet, and that is exactly why
 * this exists: without it, every feature that needs to send something stays
 * unbuilt until the credentials land, and then all of them need writing at
 * once. With it, the call sites are already correct and configuring
 * `SMTP_HOST` is the whole remaining step.
 *
 * Unconfigured, mail is written to the log instead of being dropped, so a
 * developer can see exactly what would have gone out and to whom. That is a
 * deliberate choice over throwing: an order must still be placed when the mail
 * server is missing or down.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Required — some clients never render the HTML. */
  text: string;
  html?: string;
}

export interface MailResult {
  sent: boolean;
  /** `smtp` when it actually went out, `log` when it was only recorded. */
  via: 'smtp' | 'log';
  error?: string;
}

const isConfigured = (): boolean => Boolean(process.env.SMTP_HOST?.trim());

export const mailFrom = (): string =>
  process.env.MAIL_FROM?.trim() || 'Creative Impression <no-reply@creativeimpression.in>';

// Built once and reused: a transport per message opens a new TCP and TLS
// handshake for every mail, which is what makes a batch send crawl.
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isConfigured()) return null;
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    // 465 is implicit TLS; 587 and 25 start plaintext and upgrade via STARTTLS.
    secure: port === 465,
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } }
      : {}),
  });
  return transporter;
}

/**
 * Send one message.
 *
 * Never throws. Callers are order placement and stock restocking, where a mail
 * failure must not roll back work that already succeeded — the result says what
 * happened so the caller can log it, and nothing more.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = getTransporter();

  if (!transport) {
    console.info(
      `[mail:log] to=${message.to} subject=${JSON.stringify(message.subject)} — not sent, SMTP_HOST is unset`
    );
    return { sent: false, via: 'log' };
  }

  try {
    await transport.sendMail({
      from: mailFrom(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    return { sent: true, via: 'smtp' };
  } catch (error) {
    const reason = (error as Error).message;
    console.error(`[mail] failed to ${message.to} (${message.subject}): ${reason}`);
    return { sent: false, via: 'smtp', error: reason };
  }
}

/**
 * Send several messages without letting one failure stop the rest.
 *
 * Sequential on purpose: a restock can wake a few hundred waiting shoppers at
 * once, and firing every message in parallel is what gets a sending domain
 * rate-limited or blacklisted.
 */
export async function sendMailBatch(messages: MailMessage[]): Promise<MailResult[]> {
  const results: MailResult[] = [];
  for (const message of messages) {
    results.push(await sendMail(message));
  }
  return results;
}

/** True when mail will actually leave the building. */
export const mailerReady = isConfigured;
