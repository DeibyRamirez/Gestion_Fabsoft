import type { Settings } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { SettingsRepos } from '../shared/settings.js';

export class GetSettings {
  constructor(private readonly uow: UnitOfWork<SettingsRepos>) {}

  async execute(actor: UserActor): Promise<Settings> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, ({ settings }) => settings.get());
  }
}
