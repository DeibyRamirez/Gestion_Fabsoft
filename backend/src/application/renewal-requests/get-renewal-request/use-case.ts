import { ApplicationError } from '../../shared/application-error.js';
import type { UserActor } from '../../shared/actor.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { GetRenewalRequestRepos, RenewalRequestView } from '../list-renewal-requests/ports.js';

export class GetRenewalRequest {
  constructor(private readonly uow: UnitOfWork<GetRenewalRequestRepos>) {}

  async execute(actor: UserActor, id: string): Promise<RenewalRequestView> {
    const request = await this.uow.run(actor, ({ renewalRequestDetail }) =>
      renewalRequestDetail.findById(id),
    );
    if (!request) throw new ApplicationError('not_found', 'Solicitud no encontrada');
    return request;
  }
}
