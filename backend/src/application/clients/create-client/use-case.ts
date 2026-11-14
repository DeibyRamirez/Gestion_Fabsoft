import type { ClientCreateInput } from '@fabsoft/shared';
import { normalizeTaxId } from '../../../domain/clients/tax-id.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { GetUserQuery } from '../../users/get-user/ports.js';
import { clientAuditSnapshot } from '../shared/client-audit.js';
import { clientTaxIdTakenError } from '../shared/client-errors.js';
import type { ClientView } from '../shared/client-view.js';
import { assertInternalOwner } from '../shared/owner-validation.js';
import type { CreateClientRepos } from './ports.js';

type CreateClientUow = CreateClientRepos & { audit: AuditWriter; userDetail: GetUserQuery };

export class CreateClient {
  constructor(private readonly uow: UnitOfWork<CreateClientUow>) {}

  async execute(actor: UserActor, input: ClientCreateInput): Promise<ClientView> {
    requireRole(actor, 'admin', 'operator');
    const taxId = input.taxId === undefined ? null : input.taxId;
    if (taxId !== null && normalizeTaxId(taxId).length === 0) {
      throw new ApplicationError('validation_error', 'Identificación fiscal inválida');
    }
    const outcome = await this.uow.run(actor, async ({ clientCreate, audit, userDetail }) => {
      await assertInternalOwner(userDetail, input.ownerUserId ?? null);
      const res = await clientCreate.insert({
        legalName: input.legalName,
        taxId,
        email: input.email ?? null,
        phone: input.phone ?? null,
        ownerUserId: input.ownerUserId ?? null,
        status: input.status,
        createdBy: actor.userId,
      });
      if (res.ok) {
        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'client.created',
          resourceType: 'client',
          resourceId: res.client.id,
          changes: { after: clientAuditSnapshot(res.client) },
          requestId: actor.requestId,
        });
      }
      return res;
    });
    if (!outcome.ok) throw clientTaxIdTakenError(outcome.conflict);
    return outcome.client;
  }
}
