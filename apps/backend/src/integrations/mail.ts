import nodemailer, { type Transporter } from 'nodemailer';
import { notConfigured } from '../lib/errors';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Stable id so receiving systems can de-duplicate retries. */
  messageId?: string;
}

export interface Mailer {
  readonly configured: boolean;
  send(msg: MailMessage): Promise<{ messageId: string }>;
}

export class SmtpMailer implements Mailer {
  readonly configured = true;
  private readonly transport: Transporter;
  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(msg: MailMessage) {
    const info = await this.transport.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
      messageId: msg.messageId,
    });
    return { messageId: String(info.messageId ?? msg.messageId ?? '') };
  }
}

/** Used when SMTP is not configured: delivery fails (and is retried/dead-lettered), never "succeeds". */
export class UnconfiguredMailer implements Mailer {
  readonly configured = false;
  async send(): Promise<{ messageId: string }> {
    throw notConfigured('Email delivery', 'EMAIL_NOT_CONFIGURED');
  }
}
