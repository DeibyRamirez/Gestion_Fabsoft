import type { AlertEmailTemplate } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { AlertEmailTemplateRepos } from '../shared/email-template.js';

type UpdateAlertEmailTemplateUow = AlertEmailTemplateRepos & { audit: AuditWriter };

export class UpdateAlertEmailTemplate {
  constructor(private readonly uow: UnitOfWork<UpdateAlertEmailTemplateUow>) {}

  async execute(actor: UserActor, input: AlertEmailTemplate): Promise<AlertEmailTemplate> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ alertEmailTemplate, audit }) => {
      const before = await alertEmailTemplate.get();
      const after = await alertEmailTemplate.update(input, actor.userId);
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'app_setting.updated',
        resourceType: 'app_setting',
        resourceId: 'alert_email_template',
        changes: { before: { value: before }, after: { value: after } },
        requestId: actor.requestId,
      });
      return after;
    });
  }
}
