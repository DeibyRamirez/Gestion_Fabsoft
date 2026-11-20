import type {
  PortalRenewalRequestListQuery,
  PortalSubscriptionListQuery,
  RenewalOutcome,
  RenewalRequestResolution,
  RenewalRequestStatus,
  SubscriptionStatus,
} from '@fabsoft/shared';
import type {
  PortalContactChannelView,
  PortalOrganizationView,
  PortalPeriodView,
  PortalRenewalRequestView,
  PortalSubscriptionView,
} from '../../../../application/portal/shared/portal-views.js';
import type { PortalMeQuery } from '../../../../application/portal/get-portal-me/ports.js';
import type { PortalSubscriptionListRepository } from '../../../../application/portal/list-portal-subscriptions/ports.js';
import type { PortalSubscriptionQuery } from '../../../../application/portal/get-portal-subscription/ports.js';
import type { PortalPeriodsQuery } from '../../../../application/portal/list-portal-subscription-periods/ports.js';
import type { PortalRenewalRequestListRepository } from '../../../../application/portal/list-portal-renewal-requests/ports.js';
import type { PortalRenewalRequestQuery } from '../../../../application/portal/get-portal-renewal-request/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface PortalSubscriptionRow {
  id: string;
  product_name: string;
  contract_reference: string | null;
  start_date: string;
  current_period_end: string;
  billing_cycle: PortalSubscriptionView['billingCycle'];
  price_amount: string;
  status: SubscriptionStatus;
  renewal_terms: string | null;
  has_open_renewal_request: boolean;
}

interface PortalPeriodRow {
  period_number: number;
  start_date: string;
  end_date: string;
  billing_cycle: PortalPeriodView['billingCycle'];
  price_amount: string;
  renewal_outcome: RenewalOutcome;
}

interface PortalRenewalRequestRow {
  id: string;
  subscription_id: string;
  product_name: string | null;
  comment: string | null;
  status: RenewalRequestStatus;
  resolution: RenewalRequestResolution | null;
  resolution_note: string | null;
  created_at: Date;
  resolved_at: Date | null;
}

const SUBSCRIPTION_COLUMNS = `s.id::text as id,
  p.name as product_name,
  s.contract_reference,
  s.start_date::text as start_date,
  s.current_period_end::text as current_period_end,
  s.billing_cycle::text as billing_cycle,
  s.price_amount::text as price_amount,
  s.status::text as status,
  s.renewal_terms,
  exists (
    select 1 from app.renewal_requests rr
     where rr.subscription_id = s.id
       and rr.status in ('pendiente_revision', 'en_progreso')
  ) as has_open_renewal_request`;

const SUBSCRIPTION_FROM = `from app.portal_subscriptions s
  join app.products p on p.id = s.product_id`;

const toSubscriptionView = (row: PortalSubscriptionRow): PortalSubscriptionView => ({
  id: row.id,
  productName: row.product_name,
  contractReference: row.contract_reference,
  startDate: row.start_date,
  currentPeriodEnd: row.current_period_end,
  billingCycle: row.billing_cycle,
  priceAmount: Number(row.price_amount),
  currency: 'COP',
  status: row.status,
  renewalTerms: row.renewal_terms,
  hasOpenRenewalRequest: row.has_open_renewal_request,
});

const toPeriodView = (row: PortalPeriodRow): PortalPeriodView => ({
  periodNumber: row.period_number,
  startDate: row.start_date,
  endDate: row.end_date,
  billingCycle: row.billing_cycle,
  priceAmount: Number(row.price_amount),
  currency: 'COP',
  renewalOutcome: row.renewal_outcome,
});

const toRenewalRequestView = (row: PortalRenewalRequestRow): PortalRenewalRequestView => ({
  id: row.id,
  subscriptionId: row.subscription_id,
  productName: row.product_name,
  comment: row.comment,
  status: row.status,
  resolution: row.resolution,
  resolutionNote: row.resolution_note,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

export class PgPortalMeQuery implements PortalMeQuery {
  constructor(private readonly tx: Tx) {}

  async findOrganization(clientId: string): Promise<PortalOrganizationView | null> {
    const { rows } = await this.tx.query<{
      id: string;
      legal_name: string;
      tax_id: string | null;
    }>(`select id::text as id, legal_name, tax_id from app.clients where id = $1`, [clientId]);
    const row = rows[0];
    return row ? { id: row.id, legalName: row.legal_name, taxId: row.tax_id } : null;
  }

  async findContactChannel(): Promise<PortalContactChannelView> {
    const { rows } = await this.tx.query<{ value: unknown }>(
      `select value from app.app_settings where key = 'contact_channel'`,
    );
    const value = (rows[0]?.value ?? {}) as Record<string, unknown>;
    return {
      email: typeof value['email'] === 'string' ? value['email'] : null,
      phone: typeof value['phone'] === 'string' ? value['phone'] : null,
      hours: typeof value['hours'] === 'string' ? value['hours'] : null,
    };
  }
}

export class PgPortalSubscriptionsQuery
  implements PortalSubscriptionListRepository, PortalSubscriptionQuery
{
  constructor(private readonly tx: Tx) {}

  async list(clientId: string, query: PortalSubscriptionListQuery) {
    const where = ['s.client_id = $1'];
    const values: unknown[] = [clientId];
    if (query.status?.length) {
      values.push(query.status);
      where.push(`s.status = any($${values.length}::app.subscription_status[])`);
    }
    const filter = `where ${where.join(' and ')}`;
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n from app.portal_subscriptions s ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<PortalSubscriptionRow>(
      `select ${SUBSCRIPTION_COLUMNS} ${SUBSCRIPTION_FROM} ${filter}
        order by s.current_period_end asc, s.id
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { items: rows.map(toSubscriptionView), total: Number(count.rows[0]?.n ?? 0) };
  }

  async findById(clientId: string, id: string): Promise<PortalSubscriptionView | null> {
    const { rows } = await this.tx.query<PortalSubscriptionRow>(
      `select ${SUBSCRIPTION_COLUMNS} ${SUBSCRIPTION_FROM}
        where s.client_id = $1 and s.id = $2
        limit 1`,
      [clientId, id],
    );
    return rows[0] ? toSubscriptionView(rows[0]) : null;
  }
}

export class PgPortalPeriodsQuery implements PortalPeriodsQuery {
  constructor(private readonly tx: Tx) {}

  async list(subscriptionId: string): Promise<PortalPeriodView[]> {
    const { rows } = await this.tx.query<PortalPeriodRow>(
      `select period_number, start_date::text as start_date, end_date::text as end_date,
              billing_cycle::text as billing_cycle, price_amount::text as price_amount,
              renewal_outcome::text as renewal_outcome
         from app.portal_subscription_periods
        where subscription_id = $1
        order by period_number desc`,
      [subscriptionId],
    );
    return rows.map(toPeriodView);
  }
}

const RENEWAL_REQUEST_COLUMNS = `rr.id::text as id,
  rr.subscription_id::text as subscription_id,
  p.name as product_name,
  rr.comment,
  rr.status::text as status,
  rr.resolution::text as resolution,
  rr.resolution_note,
  rr.created_at,
  rr.resolved_at`;

const RENEWAL_REQUEST_FROM = `from app.renewal_requests rr
  left join app.portal_subscriptions s on s.id = rr.subscription_id
  left join app.products p on p.id = s.product_id`;

export class PgPortalRenewalRequestsQuery
  implements PortalRenewalRequestListRepository, PortalRenewalRequestQuery
{
  constructor(private readonly tx: Tx) {}

  async list(clientId: string, query: PortalRenewalRequestListQuery) {
    const where = ['rr.client_id = $1'];
    const values: unknown[] = [clientId];
    if (query.subscriptionId) {
      values.push(query.subscriptionId);
      where.push(`rr.subscription_id = $${values.length}`);
    }
    const filter = `where ${where.join(' and ')}`;
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::bigint as n from app.renewal_requests rr ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<PortalRenewalRequestRow>(
      `select ${RENEWAL_REQUEST_COLUMNS} ${RENEWAL_REQUEST_FROM} ${filter}
        order by rr.created_at desc, rr.id
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { items: rows.map(toRenewalRequestView), total: Number(count.rows[0]?.n ?? 0) };
  }

  async findById(clientId: string, id: string): Promise<PortalRenewalRequestView | null> {
    const { rows } = await this.tx.query<PortalRenewalRequestRow>(
      `select ${RENEWAL_REQUEST_COLUMNS} ${RENEWAL_REQUEST_FROM}
        where rr.client_id = $1 and rr.id = $2
        limit 1`,
      [clientId, id],
    );
    return rows[0] ? toRenewalRequestView(rows[0]) : null;
  }
}
