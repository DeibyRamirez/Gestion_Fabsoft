import type {
  ExpireSubscriptionsRepository,
  ExpireSubscriptionsResult,
} from '../../../../application/subscriptions/expire-subscriptions/ports.js';
import type { LocalDate } from '../../../../domain/subscriptions/local-date.js';
import type { Tx } from '../../../db/with-rls-context.js';

export class PgExpireSubscriptionsRepository implements ExpireSubscriptionsRepository {
  constructor(private readonly tx: Tx) {}

  async expire(today: LocalDate): Promise<ExpireSubscriptionsResult> {
    const { rows } = await this.tx.query<{ status: 'expired' | 'not_renewed' }>(
      `with target as (
         select s.id,
                case when per.renewal_outcome = 'not_renewed'
                     then 'not_renewed'::app.subscription_status
                     else 'expired'::app.subscription_status
                end as next_status
           from app.subscriptions s
           left join lateral (
             select sp.renewal_outcome
               from app.subscription_periods sp
              where sp.subscription_id = s.id
              order by sp.period_number desc
              limit 1
           ) per on true
          where s.status in ('active','in_renewal')
            and s.current_period_end < $1::date
       )
       update app.subscriptions s
          set status = t.next_status, version = version + 1, updated_by = null
         from target t
        where s.id = t.id
        returning s.status`,
      [today],
    );
    return {
      expired: rows.filter((r) => r.status === 'expired').length,
      notRenewed: rows.filter((r) => r.status === 'not_renewed').length,
    };
  }
}
