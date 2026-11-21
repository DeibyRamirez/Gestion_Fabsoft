import type { Settings } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { SettingsRepos } from '../shared/settings.js';

type UpdateSettingsUow = SettingsRepos & { audit: AuditWriter };

export class UpdateSettings {
  constructor(private readonly uow: UnitOfWork<UpdateSettingsUow>) {}

  async execute(actor: UserActor, input: Settings): Promise<Settings> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ settings, audit }) => {
      const before = await settings.get();
      const after = await settings.update(input, actor.userId);
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'app_setting.updated',
        resourceType: 'app_setting',
        resourceId: 'contact_channel',
        changes: {
          before: { value: before.contactChannel },
          after: { value: after.contactChannel },
        },
        requestId: actor.requestId,
      });
      return after;
    });
  }
}
