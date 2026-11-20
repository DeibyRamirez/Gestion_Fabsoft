import type { AuditLogListQuery } from '@fabsoft/shared';
import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { AuditLogView } from '../shared/audit-log-view.js';
import { ListAuditLogs } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'admin-id',
  role: 'admin',
  clientId: null,
  requestId: 'req-1',
};
const operator: UserActor = {
  actorType: 'user',
  userId: 'op-id',
  role: 'operator',
  clientId: null,
  requestId: 'req-2',
};

const query: AuditLogListQuery = { page: 1, pageSize: 20 };

const log: AuditLogView = {
  id: '1',
  occurredAt: new Date('2026-11-14T12:00:00Z'),
  actorType: 'user',
  actor: { id: 'admin-id', name: 'Admin' },
  action: 'subscription.updated',
  resourceType: 'subscription',
  resourceId: 'sub-1',
  clientId: 'client-1',
  changes: { before: { status: 'activa' }, after: { status: 'en_renovacion' } },
  reason: null,
  requestId: 'req-1',
};

describe('ListAuditLogs', () => {
  it('rechaza roles distintos de admin', async () => {
    const run = vi.fn();
    const uc = new ListAuditLogs({ run });
    await expect(uc.execute(operator, query)).rejects.toMatchObject({ code: 'forbidden' });
    expect(run).not.toHaveBeenCalled();
  });

  it('devuelve la página del repositorio', async () => {
    const list = vi.fn(async () => ({ items: [log], total: 1 }));
    const uc = new ListAuditLogs({ run: async (_actor, work) => work({ auditLogs: { list } }) });
    await expect(uc.execute(admin, query)).resolves.toEqual({ items: [log], total: 1 });
    expect(list).toHaveBeenCalledWith(query);
  });
});
