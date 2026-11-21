import { describe, expect, it, vi } from 'vitest';
import {
  PermanentEmailError,
  RetryableEmailError,
  type EmailMessage,
} from '../../application/notifications/shared/email-sender.js';
import { SmtpEmailSender, type SmtpTransport } from './smtp-email-sender.js';

const message: EmailMessage = {
  to: 'admin@fabsoft.test',
  subject: 'Recordatorio',
  text: 'Contenido',
  idempotencyKey: 'exp:sub:rule:2026-12-31:email:user',
};

const config = (transport: SmtpTransport) => ({
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  from: 'FabSoft <alertas@fabsoft.test>',
  transport,
});

describe('SmtpEmailSender', () => {
  it('envía por el transporte inyectado y devuelve el messageId', async () => {
    const sendMail = vi.fn(async () => ({ messageId: '<smtp-1@fabsoft.test>' }));
    const sender = new SmtpEmailSender(config({ sendMail }));

    await expect(sender.send(message)).resolves.toEqual({
      providerMessageId: '<smtp-1@fabsoft.test>',
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'FabSoft <alertas@fabsoft.test>',
      to: message.to,
      subject: message.subject,
      text: message.text,
      headers: { 'X-Idempotency-Key': message.idempotencyKey },
    });
  });

  it('usa un id sintético si el servidor no devuelve messageId', async () => {
    const sender = new SmtpEmailSender(config({ sendMail: async () => ({}) }));
    await expect(sender.send(message)).resolves.toEqual({
      providerMessageId: `smtp:${message.idempotencyKey}`,
    });
  });

  it('clasifica errores de conexión como recuperables', async () => {
    const sender = new SmtpEmailSender(
      config({
        sendMail: async () => {
          throw Object.assign(new Error('connection timeout'), { code: 'ETIMEDOUT' });
        },
      }),
    );
    await expect(sender.send(message)).rejects.toBeInstanceOf(RetryableEmailError);
  });

  it('clasifica errores de autenticación como permanentes', async () => {
    const sender = new SmtpEmailSender(
      config({
        sendMail: async () => {
          throw Object.assign(new Error('invalid login'), { code: 'EAUTH' });
        },
      }),
    );
    await expect(sender.send(message)).rejects.toBeInstanceOf(PermanentEmailError);
  });

  it('clasifica responseCode 5xx como permanente y 4xx como recuperable', async () => {
    const permanent = new SmtpEmailSender(
      config({
        sendMail: async () => {
          throw Object.assign(new Error('mailbox unavailable'), { responseCode: 550 });
        },
      }),
    );
    await expect(permanent.send(message)).rejects.toBeInstanceOf(PermanentEmailError);

    const retryable = new SmtpEmailSender(
      config({
        sendMail: async () => {
          throw Object.assign(new Error('try later'), { responseCode: 421 });
        },
      }),
    );
    await expect(retryable.send(message)).rejects.toBeInstanceOf(RetryableEmailError);
  });
});
