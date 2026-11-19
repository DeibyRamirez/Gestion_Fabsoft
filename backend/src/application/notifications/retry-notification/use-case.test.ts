import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { NotificationView } from '../shared/notification-view.js';
import { RetryNotification } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};

const view = (over: Partial<NotificationView> = {}): NotificationView => ({
  id: 'not-1',
  notificationType: 'expiration_alert',
  subscriptionId: 'sub-1',
  renewalRequestId: null,
  taskId: null,
  ruleCode: 'D30',
  periodEnd: '2026-12-31',
  channel: 'email',
  recipient: { id: 'a', fullName: 'Admin' },
  scheduledFor: new Date('2026-12-01T13:00:00Z'),
  status: 'failed',
  attempts: 5,
  maxAttempts: 5,
  nextAttemptAt: null,
  lastError: 'fallo',
  sentAt: null,
  readAt: null,
  cancelReason: null,
  title: 'Alerta',
  ...over,
});

function makeUc(obsolete: boolean) {
  const restart = vi.fn(async () => view({ status: 'pending', attempts: 0 }));
  const audit = vi.fn(async () => undefined);
  const uc = new RetryNotification(
    {
      run: async (_a, work) =>
        work({
          notificationsRetry: {
            loadForRetry: async () => ({ notification: view(), obsolete }),
            restart,
          },
          audit: { write: audit },
        }),
    },
    { now: () => new Date('2026-11-17T12:00:00Z') },
  );
  return { uc, restart, audit };
}

describe('RetryNotification', () => {
  it('reprograma una fallida y audita', async () => {
    const { uc, restart, audit } = makeUc(false);
    await expect(uc.execute(admin, 'not-1')).resolves.toMatchObject({ status: 'pending' });
    expect(restart).toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notification.retried', resourceId: 'not-1' }),
    );
  });

  it('rechaza una notificación obsoleta', async () => {
    const { uc } = makeUc(true);
    await expect(uc.execute(admin, 'not-1')).rejects.toMatchObject({
      code: 'notification_obsolete',
    });
  });
});
