import { describe, expect, it, vi } from 'vitest';
import {
  PermanentEmailError,
  RetryableEmailError,
} from '../../application/notifications/shared/email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';

const message = {
  to: 'admin@fabsoft.test',
  subject: 'Recordatorio',
  text: 'Texto',
  idempotencyKey: 'exp:sub:D30:2026-12-31:email:user',
};

const senderWith = (fetchImpl: typeof fetch) =>
  new ResendEmailSender({
    apiKey: 're_test',
    from: 'FabSoft <alertas@fabsoft.test>',
    maxRps: 1000,
    fetchImpl,
  });

describe('ResendEmailSender', () => {
  it('envía y devuelve el id de Resend con Idempotency-Key', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 're_123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    await expect(senderWith(fetchImpl).send(message)).resolves.toEqual({
      providerMessageId: 're_123',
    });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      message.idempotencyKey,
    );
  });

  it('envía también la versión HTML cuando está presente', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 're_123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    await senderWith(fetchImpl).send({ ...message, html: '<p>Hola</p>' });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body['html']).toBe('<p>Hola</p>');
    expect(body['text']).toBe('Texto');
  });

  it('clasifica 429/5xx como recuperables y 4xx como permanentes', async () => {
    const tooMany = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'rate limit' }), {
          status: 429,
          headers: { 'retry-after': '9' },
        }),
    ) as unknown as typeof fetch;
    await expect(senderWith(tooMany).send(message)).rejects.toMatchObject({
      constructor: RetryableEmailError,
      retryAfterMs: 9000,
    });

    const serverError = vi.fn(
      async () => new Response('{}', { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(senderWith(serverError).send(message)).rejects.toBeInstanceOf(RetryableEmailError);

    const badRequest = vi.fn(
      async () => new Response('{}', { status: 422 }),
    ) as unknown as typeof fetch;
    await expect(senderWith(badRequest).send(message)).rejects.toBeInstanceOf(PermanentEmailError);
  });
});
