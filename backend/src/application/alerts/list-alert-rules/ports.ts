import type { AlertRuleView } from '../shared/alert-rule-view.js';

export interface ListAlertRulesQuery {
  list(): Promise<AlertRuleView[]>;
}

export interface ListAlertRulesRepos {
  alertRulesList: ListAlertRulesQuery;
}
