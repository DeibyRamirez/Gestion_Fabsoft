import nodemailer from 'nodemailer';
import {
  PermanentEmailError,
  RetryableEmailError,
  type EmailMessage,
  type EmailSendResult,
  type EmailSender,
} from '../../application/notifications/shared/email-sender.js';

/** Permite inyectar un transporte falso en tests sin abrir conexiones SMTP. */
export interface SmtpTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    headers: Record<string, string>;
  }): Promise<{ messageId?: string }>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  from: string;
  rejectUnauthorized?: boolean | undefined;
  transport?: SmtpTransport | undefined;
}

const PERMANENT_SMTP_CODES = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE', 'EACCES']);

function classifySmtpError(error: unknown): Error {
  if (error instanceof PermanentEmailError || error instanceof RetryableEmailError) return error;
  const details = error as { code?: string; responseCode?: number; message?: string };
  const message = details.message ?? String(error);
  if (details.responseCode && details.responseCode >= 500) {
    return new PermanentEmailError(message);
  }
  if (details.responseCode && details.responseCode >= 400) {
    return new RetryableEmailError(message);
  }
  if (details.code && PERMANENT_SMTP_CODES.has(details.code)) {
    return new PermanentEmailError(message);
  }
  return new RetryableEmailError(message);
}

/** Adaptador SMTP intercambiable con Resend/log detrás del puerto EmailSender. */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: SmtpTransport;

  constructor(private readonly config: SmtpConfig) {
    this.transport =
      config.transport ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
        auth:
          config.user && config.password ? { user: config.user, pass: config.password } : undefined,
        tls: { rejectUnauthorized: config.rejectUnauthorized ?? true },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
      });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        headers: { 'X-Idempotency-Key': message.idempotencyKey },
      });
      return { providerMessageId: info.messageId ?? `smtp:${message.idempotencyKey}` };
    } catch (error) {
      throw classifySmtpError(error);
    }
  }
}
