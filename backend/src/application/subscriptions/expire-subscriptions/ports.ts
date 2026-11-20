import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

export interface ExpireSubscriptionsResult {
  expired: number;
  notRenewed: number;
}

export interface ExpireSubscriptionsRepository {
  /** `expired` o `not_renewed` según el outcome del periodo vigente (RN-03/RN-10). */
  expire(today: LocalDate): Promise<ExpireSubscriptionsResult>;
}

export interface ExpireSubscriptionsRepos {
  subscriptionsExpire: ExpireSubscriptionsRepository;
}
