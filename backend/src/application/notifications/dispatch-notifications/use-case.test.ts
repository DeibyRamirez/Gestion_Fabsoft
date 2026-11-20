import { describe, expect, it, vi } from 'vitest';
import {
  PermanentEmailError,
  RetryableEmailError,
  type EmailSender,
} from '../shared/email-sender.js';
import type { DispatchableNotification } from './ports.js';
import { DispatchNotifications } from './use-case.js';

const clock = { now: () => new Date('2026-11-17T12:00:00Z') };

const item = (over: Partial<DispatchableNotification> = {}): DispatchableNotification => ({
  id: 'not-1',
  notificationType: 'expiration_alert',
  subscriptionId: 'sub-1',
  periodEnd: '2026-12-31',
  channel: 'email',
  recipientEmail: 'admin@fabsoft.test',
  recipientName: 'Ana Admin',
  clientName: 'Acme',
  productName: 'M365',
  ruleCode: 'D30',
  dedupeKey: 'exp:sub-1:D30:2026-12-31:email:u',
  attempts: 0,
  maxAttempts: 5,
  ...over,
});

function makeUc(rows: DispatchableNotification[], sender: EmailSender, cancelled = 0) {
  const claimDue = vi.fn(async () => ({ items: rows, cancelled }));
  const markSent = vi.fn(async () => true);
  const markFailure = vi.fn(async () => true);
  const uc = new DispatchNotifications(
    {
      run: async (_rid, work) =>
        work({
          notificationsDispatch: { claimDue, markSent, markFailure },
        }),
    },
    sender,
    clock,
    50,
    'http://localhost:3000',
  );
  return { uc, claimDue, markSent, markFailure };
}

describe('DispatchNotifications', () => {
  it('marca in_app como enviada', async () => {
    const sender = { send: vi.fn() };
    const { uc, markSent } = makeUc([item({ channel: 'in_app' })], sender);
    await expect(uc.execute('job-1')).resolves.toMatchObject({ sent: 1 });
    expect(markSent).toHaveBeenCalledWith('not-1', 0, null, clock.now());
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('envía email y marca enviada con attempts incrementado', async () => {
    const sender = { send: vi.fn(async () => ({ providerMessageId: 're_1' })) };
    const { uc, markSent } = makeUc([item()], sender);
    await expect(uc.execute('job-1')).resolves.toMatchObject({ sent: 1 });
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@fabsoft.test', idempotencyKey: item().dedupeKey }),
    );
    expect(markSent).toHaveBeenCalledWith('not-1', 1, 're_1', clock.now());
  });

  it('programa reintento recuperable y falla el permanente', async () => {
    const retryable = {
      send: vi.fn(async () => {
        throw new RetryableEmailError('timeout');
      }),
    };
    const retry = makeUc([item()], retryable);
    await expect(retry.uc.execute('job-1')).resolves.toMatchObject({ retried: 1, failed: 0 });
    expect(retry.markFailure).toHaveBeenCalledWith(
      'not-1',
      1,
      'pendiente',
      'timeout',
      expect.any(Date),
    );

    const permanent = {
      send: vi.fn(async () => {
        throw new PermanentEmailError('dirección inválida');
      }),
    };
    const failed = makeUc([item({ attempts: 3 })], permanent);
    await expect(failed.uc.execute('job-1')).resolves.toMatchObject({ failed: 1, retried: 0 });
    expect(failed.markFailure).toHaveBeenCalledWith(
      'not-1',
      4,
      'fallida',
      'dirección inválida',
      null,
    );
  });

  it('devuelve las canceladas por revalidación y no las envía', async () => {
    const sender = { send: vi.fn() };
    const { uc } = makeUc([], sender, 2);
    await expect(uc.execute('job-1')).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 0,
      cancelled: 2,
    });
  });
});
