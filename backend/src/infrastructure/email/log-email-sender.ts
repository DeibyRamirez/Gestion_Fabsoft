import type {
  EmailMessage,
  EmailSendResult,
  EmailSender,
} from '../../application/notifications/shared/email-sender.js';

export class LogEmailSender implements EmailSender {
  constructor(private readonly log: (entry: Record<string, unknown>) => void) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.log({
      level: 'info',
      msg: 'email.log',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ? '(html)' : null,
      idempotencyKey: message.idempotencyKey,
    });
    return { providerMessageId: `log:${message.idempotencyKey}` };
  }
}
