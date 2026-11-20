import type { RenewalRequestCreateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { CreatedRenewalRequestView } from '../../portal/shared/portal-views.js';
import type { CreateRenewalRequestRepos } from './ports.js';

type CreateRenewalRequestUow = CreateRenewalRequestRepos & { audit: AuditWriter };

const TERMINAL = new Set(['cancelada', 'no_renovada']);

export class CreateRenewalRequest {
  constructor(private readonly uow: UnitOfWork<CreateRenewalRequestUow>) {}

  async execute(
    actor: UserActor,
    input: RenewalRequestCreateInput,
  ): Promise<CreatedRenewalRequestView> {
    requireRole(actor, 'admin', 'operator', 'client');
    if (actor.role === 'client' && !actor.clientId) {
      throw new ApplicationError('forbidden', 'Usuario sin organización');
    }
    return this.uow.run(actor, async ({ renewalRequestCreate, audit }) => {
      const subscription =
        actor.role === 'client'
          ? await renewalRequestCreate.findForClient(actor.clientId!, input.subscriptionId)
          : await renewalRequestCreate.findForStaff(input.subscriptionId);
      if (!subscription) {
        throw new ApplicationError('not_found', 'Suscripción no encontrada');
      }
      if (TERMINAL.has(subscription.status)) {
        throw new ApplicationError(
          'invalid_state_transition',
          'No se puede solicitar renovación de una suscripción terminal',
        );
      }

      const request = await renewalRequestCreate.insert({
        subscriptionId: subscription.id,
        clientId: subscription.clientId,
        productName: subscription.productName,
        requestedByUserId: actor.userId,
        comment: input.comment ?? null,
      });
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'renewal_request.created',
        resourceType: 'renewal_request',
        resourceId: request.id,
        changes: {
          after: {
            subscriptionId: request.subscriptionId,
            clientId: request.clientId,
            comment: request.comment,
            status: request.status,
          },
        },
        requestId: actor.requestId,
      });
      return request;
    });
  }
}
