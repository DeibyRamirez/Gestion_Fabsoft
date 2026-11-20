export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export class RetryableEmailError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RetryableEmailError';
  }
}

export class PermanentEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentEmailError';
  }
}

/** Envío de correo detrás del worker (ADR-005). */
export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
