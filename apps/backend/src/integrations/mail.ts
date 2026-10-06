import { notConfigured } from '../lib/errors';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Our delivery id, sent along so a message can be traced in Brevo's logs. */
  messageId?: string;
}

export interface Mailer {
  readonly configured: boolean;
  send(msg: MailMessage): Promise<{ messageId: string }>;
}

/** Brevo refused the message for a reason a retry won't fix (wrong key, unverified sender, invalid address). */
export class MailRejected extends Error {}

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/** Transactional email through Brevo's API (POST /v3/smtp/email). The key stays on the server. */
export class BrevoMailer implements Mailer {
  readonly configured = true;
  constructor(
    private readonly apiKey: string,
    private readonly sender: { email: string; name: string },
  ) {}

  async send(msg: MailMessage) {
    const res = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: this.sender,
        to: [{ email: msg.to }],
        subject: msg.subject,
        textContent: msg.text,
        ...(msg.html ? { htmlContent: msg.html } : {}),
        ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
        ...(msg.messageId ? { headers: { 'X-Mailin-custom': msg.messageId } } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; code?: string; message?: string };
    if (!res.ok) {
      const reason = `Brevo ${res.status}: ${body.message ?? body.code ?? res.statusText}`;
      // Rate limits and server errors are retried; other client errors won't succeed on retry.
      throw res.status >= 400 && res.status < 500 && res.status !== 429 ? new MailRejected(reason) : new Error(reason);
    }
    return { messageId: body.messageId ?? msg.messageId ?? '' };
  }
}

/** Used when Brevo is not configured: delivery fails (and is retried/dead-lettered), never "succeeds". */
export class UnconfiguredMailer implements Mailer {
  readonly configured = false;
  async send(): Promise<{ messageId: string }> {
    throw notConfigured('Email delivery', 'EMAIL_NOT_CONFIGURED');
  }
}
