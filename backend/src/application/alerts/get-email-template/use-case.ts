import type { AlertEmailTemplate } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { AlertEmailTemplateQuery } from '../shared/email-template.js';

export interface GetAlertEmailTemplateRepos {
  alertEmailTemplate: AlertEmailTemplateQuery;
}

export class GetAlertEmailTemplate {
  constructor(private readonly uow: UnitOfWork<GetAlertEmailTemplateRepos>) {}

  async execute(actor: UserActor): Promise<AlertEmailTemplate> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, ({ alertEmailTemplate }) => alertEmailTemplate.get());
  }
}
