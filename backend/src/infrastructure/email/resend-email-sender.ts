import {
  PermanentEmailError,
  RetryableEmailError,
  type EmailMessage,
  type EmailSendResult,
  type EmailSender,
} from '../../application/notifications/shared/email-sender.js';

interface ResendResponse {
  id?: string;
  message?: string;
}

class RateLimiter {
  private nextAt = 0;
  constructor(private readonly maxRps: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.nextAt - now);
    this.nextAt = Math.max(now, this.nextAt) + Math.ceil(1000 / this.maxRps);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

export interface ResendConfig {
  apiKey: string;
  from: string;
  maxRps: number;
  fetchImpl?: typeof fetch;
}

export class ResendEmailSender implements EmailSender {
  private readonly limiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ResendConfig) {
    this.limiter = new RateLimiter(config.maxRps);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    await this.limiter.acquire();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ResendResponse;
      if (response.ok && body.id) return { providerMessageId: body.id };
      if (response.ok) {
        throw new RetryableEmailError('Resend no devolvió id de mensaje');
      }
      const detail = body.message ?? `HTTP ${response.status}`;
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after') ?? '0');
        throw new RetryableEmailError(
          detail,
          Number.isFinite(seconds) ? seconds * 1000 : undefined,
        );
      }
      if (response.status >= 500) throw new RetryableEmailError(detail);
      throw new PermanentEmailError(detail);
    } catch (err) {
      if (err instanceof RetryableEmailError || err instanceof PermanentEmailError) throw err;
      throw new RetryableEmailError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeout);
    }
  }
}
