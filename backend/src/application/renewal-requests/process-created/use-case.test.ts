import { describe, expect, it, vi } from 'vitest';
import { ProcessRenewalRequestCreated } from './use-case.js';

const clock = { now: () => new Date('2026-11-19T15:00:00Z') };

describe('ProcessRenewalRequestCreated', () => {
  it('crea la tarea/notificaciones con vencimiento a 2 días', async () => {
    const createFollowUp = vi.fn(async () => ({ taskId: 't-1', notifications: 2 }));
    const uc = new ProcessRenewalRequestCreated(
      {
        run: async (_rid, work) =>
          work({
            renewalRequestProcess: {
              findContext: async () => ({
                requestId: 'rr-1',
                subscriptionId: 's-1',
                clientId: 'c-1',
                clientLegalName: 'Acme',
                productName: 'Producto',
                comment: null,
                assigneeUserId: 'u-1',
                adminIds: [],
              }),
              createFollowUp,
            },
          }),
      },
      clock,
    );
    await expect(uc.execute('rr-1')).resolves.toEqual({ taskId: 't-1', notifications: 2 });
    expect(createFollowUp).toHaveBeenCalledWith(expect.anything(), '2026-11-21');
  });

  it('no hace nada si la solicitud ya no existe', async () => {
    const uc = new ProcessRenewalRequestCreated(
      {
        run: async (_rid, work) =>
          work({
            renewalRequestProcess: {
              findContext: async () => null,
              createFollowUp: async () => ({ taskId: null, notifications: 0 }),
            },
          }),
      },
      clock,
    );
    await expect(uc.execute('missing')).resolves.toEqual({ taskId: null, notifications: 0 });
  });
});
