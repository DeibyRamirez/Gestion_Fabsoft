import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { AlertRuleView } from '../shared/alert-rule-view.js';
import type { ListAlertRulesRepos } from './ports.js';

export class ListAlertRules {
  constructor(private readonly uow: UnitOfWork<ListAlertRulesRepos>) {}

  execute(actor: UserActor): Promise<AlertRuleView[]> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, ({ alertRulesList }) => alertRulesList.list());
  }
}
