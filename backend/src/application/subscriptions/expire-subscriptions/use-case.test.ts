import { describe, expect, it, vi } from 'vitest';
import { ExpireSubscriptions } from './use-case.js';

describe('ExpireSubscriptions', () => {
  it('ejecuta con el día de negocio Bogotá', async () => {
    const expire = vi.fn(async () => ({ expired: 2, notRenewed: 1 }));
    const uc = new ExpireSubscriptions(
      { run: async (_rid, work) => work({ subscriptionsExpire: { expire } }) },
      { now: () => new Date('2026-11-18T04:30:00Z') },
    );
    await expect(uc.execute('job-1')).resolves.toEqual({ expired: 2, notRenewed: 1 });
    expect(expire).toHaveBeenCalledWith('2026-11-17');
  });
});
