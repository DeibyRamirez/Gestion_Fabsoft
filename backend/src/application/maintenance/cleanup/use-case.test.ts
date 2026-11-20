import { describe, expect, it, vi } from 'vitest';
import { CleanupMaintenance } from './use-case.js';

describe('CleanupMaintenance', () => {
  it('purga idempotencia vencida y refresh tokens con 30 días de retención', async () => {
    const cleanup = vi.fn(async () => ({ idempotencyKeys: 3, refreshTokens: 2 }));
    const now = new Date('2026-11-17T12:00:00Z');
    const uc = new CleanupMaintenance(
      { run: async (_rid, work) => work({ maintenance: { cleanup } }) },
      { now: () => now },
    );
    await expect(uc.execute('job-1')).resolves.toEqual({ idempotencyKeys: 3, refreshTokens: 2 });
    expect(cleanup).toHaveBeenCalledWith(now, new Date('2026-10-18T12:00:00Z'));
  });
});
