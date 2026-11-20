import type { SubscriptionListQuery } from '@fabsoft/shared';
import type { GetSubscriptionQuery } from '../../../../application/subscriptions/get-subscription/ports.js';
import type { ListSubscriptionsQuery } from '../../../../application/subscriptions/list-subscriptions/ports.js';
import type {
  SubscriptionPeriodView,
  SubscriptionView,
} from '../../../../application/subscriptions/shared/subscription-view.js';
import type { IntegrationPeriodsQuery } from '../../../../application/integrations/public-api/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface SubscriptionRow {
  id: string;
  client_id: string;
  product_id: string;
  client_legal_name: string;
  product_name: string;
  contract_reference: string | null;
  start_date: string;
  current_period_end: string;
  billing_cycle: SubscriptionView['billingCycle'];
  custom_cycle_months: number | null;
  price_amount: string;
  currency: 'COP';
  renewal_terms: string | null;
  is_renewable: boolean;
  status: SubscriptionView['status'];
  follow_up_status: SubscriptionView['followUpStatus'];
  visible_in_portal: boolean;
  owner_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  cp_id: string | null;
  cp_period_number: number | null;
  cp_start_date: string | null;
  cp_end_date: string | null;
  cp_billing_cycle: SubscriptionPeriodView['billingCycle'] | null;
  cp_price_amount: string | null;
  cp_currency: 'COP' | null;
  cp_renewal_outcome: SubscriptionPeriodView['renewalOutcome'] | null;
  cp_outcome_reason: string | null;
  cp_payment_status: SubscriptionPeriodView['paymentStatus'] | null;
  cp_confirmed_at: Date | null;
  cp_contract_reference: string | null;
}

interface PeriodRow {
  id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  billing_cycle: SubscriptionPeriodView['billingCycle'];
  price_amount: string;
  currency: 'COP';
  renewal_outcome: SubscriptionPeriodView['renewalOutcome'];
  outcome_reason: string | null;
  payment_status: SubscriptionPeriodView['paymentStatus'];
  confirmed_at: Date | null;
  contract_reference: string | null;
}

const COLUMNS = `s.id::text as id, s.client_id::text as client_id, s.product_id::text as product_id,
  c.legal_name as client_legal_name, p.name as product_name, s.contract_reference,
  s.start_date::text as start_date, s.current_period_end::text as current_period_end,
  s.billing_cycle::text as billing_cycle, s.custom_cycle_months,
  s.price_amount::text as price_amount, s.currency::text as currency,
  s.renewal_terms, s.is_renewable, s.status::text as status,
  s.follow_up_status::text as follow_up_status, s.visible_in_portal,
  s.owner_user_id::text as owner_user_id, s.created_at, s.updated_at,
  cp.id::text as cp_id, cp.period_number as cp_period_number,
  cp.start_date::text as cp_start_date, cp.end_date::text as cp_end_date,
  cp.billing_cycle::text as cp_billing_cycle, cp.price_amount::text as cp_price_amount,
  cp.currency::text as cp_currency, cp.renewal_outcome::text as cp_renewal_outcome,
  cp.outcome_reason as cp_outcome_reason, cp.payment_status::text as cp_payment_status,
  cp.confirmed_at as cp_confirmed_at, cp.contract_reference as cp_contract_reference`;

const FROM = `from app.integration_subscriptions s
  join app.clients c on c.id = s.client_id
  join app.products p on p.id = s.product_id
  left join lateral (
    select p.id, p.period_number, p.start_date, p.end_date, p.billing_cycle,
           p.price_amount, p.currency, p.renewal_outcome, p.outcome_reason,
           p.payment_status, p.confirmed_at, p.contract_reference
      from app.integration_subscription_periods p
     where p.subscription_id = s.id
     order by p.period_number desc
     limit 1
  ) cp on true`;

const toView = (row: SubscriptionRow): SubscriptionView => ({
  id: row.id,
  clientId: row.client_id,
  productId: row.product_id,
  client: { id: row.client_id, legalName: row.client_legal_name },
  product: { id: row.product_id, name: row.product_name },
  contractReference: row.contract_reference,
  startDate: row.start_date,
  currentPeriodEnd: row.current_period_end,
  billingCycle: row.billing_cycle,
  customCycleMonths: row.custom_cycle_months,
  priceAmount: Number(row.price_amount),
  currency: row.currency,
  supplierCostAmount: null,
  renewalTerms: row.renewal_terms,
  isRenewable: row.is_renewable,
  status: row.status,
  followUpStatus: row.follow_up_status,
  visibleInPortal: row.visible_in_portal,
  ownerUserId: row.owner_user_id,
  owner: null,
  notes: null,
  cancelledAt: null,
  cancellationReason: null,
  version: 1,
  currentPeriod:
    row.cp_id &&
    row.cp_period_number !== null &&
    row.cp_start_date &&
    row.cp_end_date &&
    row.cp_billing_cycle &&
    row.cp_price_amount !== null &&
    row.cp_currency &&
    row.cp_renewal_outcome &&
    row.cp_payment_status
      ? {
          id: row.cp_id,
          periodNumber: row.cp_period_number,
          startDate: row.cp_start_date,
          endDate: row.cp_end_date,
          billingCycle: row.cp_billing_cycle,
          priceAmount: Number(row.cp_price_amount),
          currency: row.cp_currency,
          renewalOutcome: row.cp_renewal_outcome,
          outcomeReason: row.cp_outcome_reason,
          paymentStatus: row.cp_payment_status,
          confirmedAt: row.cp_confirmed_at,
          confirmedBy: null,
          contractReference: row.cp_contract_reference,
        }
      : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPeriod = (row: PeriodRow): SubscriptionPeriodView => ({
  id: row.id,
  periodNumber: row.period_number,
  startDate: row.start_date,
  endDate: row.end_date,
  billingCycle: row.billing_cycle,
  priceAmount: Number(row.price_amount),
  currency: row.currency,
  renewalOutcome: row.renewal_outcome,
  outcomeReason: row.outcome_reason,
  paymentStatus: row.payment_status,
  confirmedAt: row.confirmed_at,
  confirmedBy: null,
  contractReference: row.contract_reference,
});

const SORT: Record<SubscriptionListQuery['sort'], string> = {
  currentPeriodEnd: 's.current_period_end asc, s.id',
  '-currentPeriodEnd': 's.current_period_end desc, s.id',
  createdAt: 's.created_at asc, s.id',
  '-createdAt': 's.created_at desc, s.id',
  clientName: 'c.legal_name asc, s.id',
  '-clientName': 'c.legal_name desc, s.id',
};

export class PgIntegrationSubscriptionsRepository
  implements ListSubscriptionsQuery, GetSubscriptionQuery, IntegrationPeriodsQuery
{
  constructor(private readonly tx: Tx) {}

  async list(query: SubscriptionListQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(c.legal_name ilike $${values.length} or p.name ilike $${values.length})`);
    }
    if (query.clientId) {
      values.push(query.clientId);
      where.push(`s.client_id = $${values.length}`);
    }
    if (query.productId) {
      values.push(query.productId);
      where.push(`s.product_id = $${values.length}`);
    }
    if (query.status?.length) {
      values.push(query.status);
      where.push(`s.status = any($${values.length}::app.subscription_status[])`);
    }
    if (query.followUpStatus) {
      values.push(query.followUpStatus);
      where.push(`s.follow_up_status = $${values.length}::app.follow_up_status`);
    }
    if (query.expiresFrom) {
      values.push(query.expiresFrom);
      where.push(`s.current_period_end >= $${values.length}::date`);
    }
    if (query.expiresTo) {
      values.push(query.expiresTo);
      where.push(`s.current_period_end <= $${values.length}::date`);
    }
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n ${FROM} ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<SubscriptionRow>(
      `select ${COLUMNS} ${FROM} ${filter}
        order by ${SORT[query.sort]}
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { items: rows.map(toView), total: Number(count.rows[0]?.n ?? 0) };
  }

  async findById(id: string): Promise<SubscriptionView | null> {
    const { rows } = await this.tx.query<SubscriptionRow>(
      `select ${COLUMNS} ${FROM} where s.id = $1 limit 1`,
      [id],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  async listPeriods(subscriptionId: string): Promise<SubscriptionPeriodView[]> {
    const { rows } = await this.tx.query<PeriodRow>(
      `select id::text as id, period_number, start_date::text as start_date, end_date::text as end_date,
              billing_cycle::text as billing_cycle, price_amount::text as price_amount,
              currency::text as currency, renewal_outcome::text as renewal_outcome,
              outcome_reason, payment_status::text as payment_status, confirmed_at, contract_reference
         from app.integration_subscription_periods
        where subscription_id = $1
        order by period_number desc`,
      [subscriptionId],
    );
    return rows.map(toPeriod);
  }
}
