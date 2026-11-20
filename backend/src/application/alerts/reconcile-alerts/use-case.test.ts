import { describe, expect, it, vi } from 'vitest';
import { ReconcileAlerts } from './use-case.js';

const result = { scannedSubscriptions: 4, scheduled: 7, cancelled: 2 };

describe('ReconcileAlerts', () => {
  it('ejecuta reconcile con el día de negocio Bogotá', async () => {
    const reconcile = vi.fn(async () => result);
    const uc = new ReconcileAlerts(
      {
        run: async (_rid, work) =>
          work({
            alerts: {
              reconcile,
              scheduleForPeriod: async () => 0,
              cancelPendingForPeriod: async () => 0,
              cancelPendingWithoutException: async () => 0,
              cancelAllPending: async () => 0,
            },
          }),
      },
      { now: () => new Date('2026-11-18T04:30:00Z') },
    );

    await expect(uc.execute('job-1')).resolves.toBe(result);
    expect(reconcile).toHaveBeenCalledWith('2026-11-17');
  });
});
