import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import type { ExpireSubscriptionsRepos, ExpireSubscriptionsResult } from './ports.js';

/** Job `subscriptions.expire` (00:05 America/Bogota). */
export class ExpireSubscriptions {
  constructor(
    private readonly uow: AuthUnitOfWork<ExpireSubscriptionsRepos>,
    private readonly clock: Clock,
  ) {}

  execute(requestId: string): Promise<ExpireSubscriptionsResult> {
    const today = toBogotaLocalDate(this.clock.now());
    return this.uow.run(requestId, ({ subscriptionsExpire }) => subscriptionsExpire.expire(today));
  }
}
