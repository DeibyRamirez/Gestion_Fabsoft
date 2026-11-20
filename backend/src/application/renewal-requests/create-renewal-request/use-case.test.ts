import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import { CreateRenewalRequest } from './use-case.js';
import type { RequestableSubscription } from './ports.js';
import type { CreatedRenewalRequestView } from '../../portal/shared/portal-views.js';

const client: UserActor = {
  actorType: 'user',
  userId: 'u-client',
  role: 'client',
  clientId: 'c-1',
  requestId: 'r-1',
};

const operator: UserActor = {
  actorType: 'user',
  userId: 'u-op',
  role: 'operator',
  clientId: null,
  requestId: 'r-2',
};

const subscription: RequestableSubscription = {
  id: 's-1',
  clientId: 'c-1',
  productName: 'Producto',
  status: 'activa',
};

const created: CreatedRenewalRequestView = {
  id: 'rr-1',
  subscriptionId: 's-1',
  clientId: 'c-1',
  productName: 'Producto',
  comment: null,
  status: 'pendiente_revision',
  createdAt: new Date('2026-11-19T15:00:00Z'),
  updatedAt: new Date('2026-11-19T15:00:00Z'),
  requestedBy: { actorType: 'user', id: 'u-client' },
};

function build(options: {
  found?: RequestableSubscription | null;
  staffFound?: RequestableSubscription | null;
  insert?: (r: unknown) => Promise<CreatedRenewalRequestView>;
}) {
  const audit = { write: vi.fn(async () => undefined) };
  const insert = vi.fn(options.insert ?? (async () => created));
  const findForClient = vi.fn(async () =>
    options.found === undefined ? subscription : options.found,
  );
  const findForStaff = vi.fn(async () =>
    options.staffFound === undefined ? subscription : options.staffFound,
  );
  const uc = new CreateRenewalRequest({
    run: async (_actor, work) =>
      work({
        renewalRequestCreate: { findForClient, findForStaff, insert },
        audit,
      }),
  });
  return { uc, audit, insert, findForClient, findForStaff };
}

describe('CreateRenewalRequest', () => {
  it('crea la solicitud del cliente y audita', async () => {
    const { uc, audit, findForClient, insert } = build({});
    await expect(uc.execute(client, { subscriptionId: 's-1', comment: 'Hola' })).resolves.toEqual(
      created,
    );
    expect(findForClient).toHaveBeenCalledWith('c-1', 's-1');
    expect(insert).toHaveBeenCalledWith({
      subscriptionId: 's-1',
      clientId: 'c-1',
      productName: 'Producto',
      requestedByUserId: 'u-client',
      comment: 'Hola',
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'renewal_request.created', resourceId: 'rr-1' }),
    );
  });

  it('staff usa la búsqueda interna', async () => {
    const { uc, findForClient, findForStaff } = build({});
    await uc.execute(operator, { subscriptionId: 's-1' });
    expect(findForClient).not.toHaveBeenCalled();
    expect(findForStaff).toHaveBeenCalledWith('s-1');
  });

  it('no encuentra suscripción ajena', async () => {
    const { uc } = build({ found: null });
    await expect(uc.execute(client, { subscriptionId: 's-1' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('rechaza suscripciones terminales', async () => {
    const { uc } = build({ found: { ...subscription, status: 'cancelada' } });
    await expect(uc.execute(client, { subscriptionId: 's-1' })).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });

});
