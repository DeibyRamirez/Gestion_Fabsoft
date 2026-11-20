import type { SubscriptionListQuery } from '@fabsoft/shared';
import type {
  CreateSubscriptionRepository,
  NewSubscriptionRecord,
} from '../../../../application/subscriptions/create-subscription/ports.js';
import type { GetSubscriptionQuery } from '../../../../application/subscriptions/get-subscription/ports.js';
import type { ListSubscriptionsQuery } from '../../../../application/subscriptions/list-subscriptions/ports.js';
import type { ActivateSubscriptionRepository } from '../../../../application/subscriptions/activate-subscription/ports.js';
import type {
  SubscriptionPatch,
  UpdateSubscriptionRepository,
} from '../../../../application/subscriptions/update-subscription/ports.js';
import type { CancelSubscriptionRepository } from '../../../../application/subscriptions/cancel-subscription/ports.js';
import type { ListSubscriptionPeriodsQuery } from '../../../../application/subscriptions/list-subscription-periods/ports.js';
import type { RenewSubscriptionRepository } from '../../../../application/subscriptions/renew-subscription/ports.js';
import type { RenewSubscriptionParams } from '../../../../application/subscriptions/renew-subscription/ports.js';
import type { StartRenewalRepository } from '../../../../application/subscriptions/start-renewal/ports.js';
import type {
  MarkNotRenewedParams,
  MarkNotRenewedRepository,
} from '../../../../application/subscriptions/mark-not-renewed/ports.js';
import type {
  CorrectExpirationParams,
  CorrectExpirationRepository,
} from '../../../../application/subscriptions/correct-expiration/ports.js';
import type {
  PeriodPaymentPatch,
  UpdatePeriodPaymentRepository,
} from '../../../../application/subscriptions/update-period-payment/ports.js';
import type {
  SubscriptionPeriodView,
  SubscriptionView,
} from '../../../../application/subscriptions/shared/subscription-view.js';
import type { Tx } from '../../../db/with-rls-context.js';

const SUBSCRIPTION_SELECT = `
  select s.id, s.client_id, c.legal_name as client_legal_name,
         s.product_id, p.name as product_name,
         s.contract_reference, s.start_date::text as start_date,
         s.current_period_end::text as current_period_end,
         s.billing_cycle, s.custom_cycle_months,
         s.price_amount::text as price_amount, s.currency,
         s.supplier_cost_amount::text as supplier_cost_amount,
         s.renewal_terms, s.is_renewable, s.status, s.follow_up_status,
         s.visible_in_portal, s.owner_user_id, u.full_name as owner_full_name,
         s.notes, s.cancelled_at, s.cancellation_reason, s.version,
         s.created_at, s.updated_at,
         per.id as period_id, per.period_number,
         per.start_date::text as period_start_date, per.end_date::text as period_end_date,
         per.billing_cycle as period_billing_cycle,
         per.price_amount::text as period_price_amount, per.currency as period_currency,
         per.renewal_outcome as period_renewal_outcome,
         per.outcome_reason as period_outcome_reason,
         per.payment_status as period_payment_status,
         per.confirmed_at as period_confirmed_at,
         per.contract_reference as period_contract_reference,
         per.confirmed_by as period_confirmed_by,
         cu.full_name as period_confirmed_by_name
    from app.subscriptions s
    join app.clients c on c.id = s.client_id
    join app.products p on p.id = s.product_id
    left join app.users u on u.id = s.owner_user_id
    left join lateral (
      select sp.* from app.subscription_periods sp
       where sp.subscription_id = s.id
       order by sp.period_number desc
       limit 1
    ) per on true
    left join app.users cu on cu.id = per.confirmed_by`;

const SUBSCRIPTION_JOINS = `
    from app.subscriptions s
    join app.clients c on c.id = s.client_id
    join app.products p on p.id = s.product_id`;

const SORT: Record<SubscriptionListQuery['sort'], string> = {
  currentPeriodEnd: 's.current_period_end asc, s.id',
  '-currentPeriodEnd': 's.current_period_end desc, s.id',
  createdAt: 's.created_at asc, s.id',
  '-createdAt': 's.created_at desc, s.id',
  clientName: 'c.legal_name asc, s.id',
  '-clientName': 'c.legal_name desc, s.id',
};

interface SubscriptionRow {
  id: string;
  client_id: string;
  client_legal_name: string;
  product_id: string;
  product_name: string;
  contract_reference: string | null;
  start_date: string;
  current_period_end: string;
  billing_cycle: SubscriptionView['billingCycle'];
  custom_cycle_months: number | null;
  price_amount: string;
  currency: string;
  supplier_cost_amount: string | null;
  renewal_terms: string | null;
  is_renewable: boolean;
  status: SubscriptionView['status'];
  follow_up_status: SubscriptionView['followUpStatus'];
  visible_in_portal: boolean;
  owner_user_id: string | null;
  owner_full_name: string | null;
  notes: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  period_id: string | null;
  period_number: number | null;
  period_start_date: string | null;
  period_end_date: string | null;
  period_billing_cycle: SubscriptionView['billingCycle'] | null;
  period_price_amount: string | null;
  period_currency: string | null;
  period_renewal_outcome: NonNullable<SubscriptionView['currentPeriod']>['renewalOutcome'] | null;
  period_outcome_reason: string | null;
  period_payment_status: NonNullable<SubscriptionView['currentPeriod']>['paymentStatus'] | null;
  period_confirmed_at: Date | null;
  period_contract_reference: string | null;
  period_confirmed_by: string | null;
  period_confirmed_by_name: string | null;
}

const num = (value: string | null): number | null => (value === null ? null : Number(value));

const toView = (r: SubscriptionRow): SubscriptionView => ({
  id: r.id,
  clientId: r.client_id,
  productId: r.product_id,
  client: { id: r.client_id, legalName: r.client_legal_name },
  product: { id: r.product_id, name: r.product_name },
  contractReference: r.contract_reference,
  startDate: r.start_date,
  currentPeriodEnd: r.current_period_end,
  billingCycle: r.billing_cycle,
  customCycleMonths: r.custom_cycle_months,
  priceAmount: Number(r.price_amount),
  currency: 'COP',
  supplierCostAmount: num(r.supplier_cost_amount),
  renewalTerms: r.renewal_terms,
  isRenewable: r.is_renewable,
  status: r.status,
  followUpStatus: r.follow_up_status,
  visibleInPortal: r.visible_in_portal,
  ownerUserId: r.owner_user_id,
  owner:
    r.owner_user_id && r.owner_full_name
      ? { id: r.owner_user_id, fullName: r.owner_full_name }
      : null,
  notes: r.notes,
  cancelledAt: r.cancelled_at,
  cancellationReason: r.cancellation_reason,
  version: r.version,
  currentPeriod:
    r.period_id &&
    r.period_number !== null &&
    r.period_start_date &&
    r.period_end_date &&
    r.period_billing_cycle &&
    r.period_price_amount !== null &&
    r.period_payment_status &&
    r.period_renewal_outcome
      ? {
          id: r.period_id,
          periodNumber: r.period_number,
          startDate: r.period_start_date,
          endDate: r.period_end_date,
          billingCycle: r.period_billing_cycle,
          priceAmount: Number(r.period_price_amount),
          currency: 'COP',
          renewalOutcome: r.period_renewal_outcome,
          outcomeReason: r.period_outcome_reason,
          paymentStatus: r.period_payment_status,
          confirmedAt: r.period_confirmed_at,
          confirmedBy:
            r.period_confirmed_by && r.period_confirmed_by_name
              ? { id: r.period_confirmed_by, fullName: r.period_confirmed_by_name }
              : null,
          contractReference: r.period_contract_reference,
        }
      : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function loadView(tx: Tx, id: string): Promise<SubscriptionView | null> {
  const { rows } = await tx.query<SubscriptionRow>(`${SUBSCRIPTION_SELECT} where s.id = $1`, [id]);
  return rows[0] ? toView(rows[0]) : null;
}

export class PgGetSubscriptionQuery implements GetSubscriptionQuery {
  constructor(private readonly tx: Tx) {}
  findById(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
}

export class PgListSubscriptionsQuery implements ListSubscriptionsQuery {
  constructor(private readonly tx: Tx) {}
  async list(q: SubscriptionListQuery): Promise<{ items: SubscriptionView[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (q.q) {
      const term = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
      values.push(term);
      where.push(
        `(c.legal_name ilike $${values.length} or p.name ilike $${values.length} or coalesce(s.contract_reference, '') ilike $${values.length})`,
      );
    }
    if (q.clientId) {
      values.push(q.clientId);
      where.push(`s.client_id = $${values.length}`);
    }
    if (q.productId) {
      values.push(q.productId);
      where.push(`s.product_id = $${values.length}`);
    }
    if (q.ownerUserId) {
      values.push(q.ownerUserId);
      where.push(`s.owner_user_id = $${values.length}`);
    }
    if (q.status?.length) {
      values.push(q.status);
      where.push(`s.status = any($${values.length}::app.subscription_status[])`);
    }
    if (q.followUpStatus) {
      values.push(q.followUpStatus);
      where.push(`s.follow_up_status = $${values.length}::app.follow_up_status`);
    }
    if (q.expiresFrom) {
      values.push(q.expiresFrom);
      where.push(`s.current_period_end >= $${values.length}::date`);
    }
    if (q.expiresTo) {
      values.push(q.expiresTo);
      where.push(`s.current_period_end <= $${values.length}::date`);
    }
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::text as n ${SUBSCRIPTION_JOINS} ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<SubscriptionRow>(
      `${SUBSCRIPTION_SELECT} ${filter} order by ${SORT[q.sort]} limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: rows.map(toView), total: Number(count.rows[0]?.n ?? 0) };
  }
}

export class PgCreateSubscriptionRepository implements CreateSubscriptionRepository {
  constructor(private readonly tx: Tx) {}
  async insert(r: NewSubscriptionRecord): Promise<SubscriptionView> {
    const { rows } = await this.tx.query<{ id: string }>(
      `insert into app.subscriptions
         (client_id, product_id, contract_reference, start_date, current_period_end,
          billing_cycle, custom_cycle_months, price_amount, currency, supplier_cost_amount,
          renewal_terms, is_renewable, status, visible_in_portal, owner_user_id, notes,
          created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
       returning id`,
      [
        r.clientId,
        r.productId,
        r.contractReference,
        r.startDate,
        r.currentPeriodEnd,
        r.billingCycle,
        r.customCycleMonths,
        r.priceAmount,
        r.currency,
        r.supplierCostAmount,
        r.renewalTerms,
        r.isRenewable,
        r.status,
        r.visibleInPortal,
        r.ownerUserId,
        r.notes,
        r.createdBy,
      ],
    );
    const id = rows[0]!.id;
    await this.tx.query(
      `insert into app.subscription_periods
         (subscription_id, period_number, start_date, end_date, billing_cycle,
          custom_cycle_months, price_amount, currency, payment_status, renewal_outcome,
          contract_reference, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'COP', $8, 'pending', $9, $10)`,
      [
        id,
        r.initialPeriod.periodNumber,
        r.initialPeriod.startDate,
        r.initialPeriod.endDate,
        r.initialPeriod.billingCycle,
        r.customCycleMonths,
        r.initialPeriod.priceAmount,
        r.initialPeriod.paymentStatus,
        r.contractReference,
        r.createdBy,
      ],
    );
    const view = await loadView(this.tx, id);
    if (!view) throw new Error('suscripción no encontrada tras crear');
    return view;
  }
}

export class PgActivateSubscriptionRepository implements ActivateSubscriptionRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
  async activate(
    id: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<SubscriptionView | null> {
    const { rowCount } = await this.tx.query(
      `update app.subscriptions
          set status = 'active', version = version + 1, updated_by = $2
        where id = $1 and version = $3`,
      [id, updatedBy, expectedVersion],
    );
    return rowCount === 1 ? loadView(this.tx, id) : null;
  }
}

export class PgUpdateSubscriptionRepository implements UpdateSubscriptionRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
  async save(
    id: string,
    expectedVersion: number,
    p: SubscriptionPatch,
    updatedBy: string,
  ): Promise<SubscriptionView | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (p.contractReference !== undefined) set('contract_reference', p.contractReference);
    if (p.renewalTerms !== undefined) set('renewal_terms', p.renewalTerms);
    if (p.isRenewable !== undefined) set('is_renewable', p.isRenewable);
    if (p.visibleInPortal !== undefined) set('visible_in_portal', p.visibleInPortal);
    if (p.ownerUserId !== undefined) set('owner_user_id', p.ownerUserId);
    if (p.notes !== undefined) set('notes', p.notes);
    if (p.followUpStatus !== undefined) set('follow_up_status', p.followUpStatus);
    if (p.priceAmount !== undefined) set('price_amount', p.priceAmount);
    if (p.supplierCostAmount !== undefined) set('supplier_cost_amount', p.supplierCostAmount);
    if (sets.length === 0) return loadView(this.tx, id);

    values.push(updatedBy);
    const updatedByParam = values.length;
    values.push(id);
    const idParam = values.length;
    values.push(expectedVersion);
    const versionParam = values.length;
    const { rowCount } = await this.tx.query(
      `update app.subscriptions
          set ${sets.join(', ')}, version = version + 1, updated_by = $${updatedByParam}
        where id = $${idParam} and version = $${versionParam}`,
      values,
    );
    return rowCount === 1 ? loadView(this.tx, id) : null;
  }
}

export class PgCancelSubscriptionRepository implements CancelSubscriptionRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
  async cancel(
    id: string,
    expectedVersion: number,
    reason: string,
    cancelledAt: Date,
    updatedBy: string,
  ): Promise<SubscriptionView | null> {
    const { rowCount } = await this.tx.query(
      `update app.subscriptions
          set status = 'cancelled', cancelled_at = $2, cancellation_reason = $3,
              version = version + 1, updated_by = $4
        where id = $1 and version = $5`,
      [id, cancelledAt, reason, updatedBy, expectedVersion],
    );
    return rowCount === 1 ? loadView(this.tx, id) : null;
  }
}

interface PeriodRow {
  id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  billing_cycle: SubscriptionPeriodView['billingCycle'];
  price_amount: string;
  currency: string;
  renewal_outcome: SubscriptionPeriodView['renewalOutcome'];
  outcome_reason: string | null;
  payment_status: SubscriptionPeriodView['paymentStatus'];
  confirmed_at: Date | null;
  contract_reference: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
}

const PERIOD_SELECT = `
  select sp.id, sp.period_number, sp.start_date::text as start_date,
         sp.end_date::text as end_date, sp.billing_cycle,
         sp.price_amount::text as price_amount, sp.currency,
         sp.renewal_outcome, sp.outcome_reason, sp.payment_status,
         sp.confirmed_at, sp.contract_reference,
         sp.confirmed_by, u.full_name as confirmed_by_name
    from app.subscription_periods sp
    left join app.users u on u.id = sp.confirmed_by`;

const toPeriodView = (r: PeriodRow): SubscriptionPeriodView => ({
  id: r.id,
  periodNumber: r.period_number,
  startDate: r.start_date,
  endDate: r.end_date,
  billingCycle: r.billing_cycle,
  priceAmount: Number(r.price_amount),
  currency: 'COP',
  renewalOutcome: r.renewal_outcome,
  outcomeReason: r.outcome_reason,
  paymentStatus: r.payment_status,
  confirmedAt: r.confirmed_at,
  confirmedBy:
    r.confirmed_by && r.confirmed_by_name
      ? { id: r.confirmed_by, fullName: r.confirmed_by_name }
      : null,
  contractReference: r.contract_reference,
});

export class PgListSubscriptionPeriodsQuery implements ListSubscriptionPeriodsQuery {
  constructor(private readonly tx: Tx) {}
  async list(subscriptionId: string): Promise<SubscriptionPeriodView[]> {
    const { rows } = await this.tx.query<PeriodRow>(
      `${PERIOD_SELECT} where sp.subscription_id = $1 order by sp.period_number desc`,
      [subscriptionId],
    );
    return rows.map(toPeriodView);
  }
}

export class PgRenewSubscriptionRepository implements RenewSubscriptionRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
  async renew(
    id: string,
    expectedVersion: number,
    p: RenewSubscriptionParams,
    updatedBy: string,
  ): Promise<SubscriptionView | null> {
    const { rowCount } = await this.tx.query(
      `update app.subscriptions
          set current_period_end = $2, status = 'active', follow_up_status = 'none',
              version = version + 1, updated_by = $3
        where id = $1 and version = $4`,
      [id, p.endDate, updatedBy, expectedVersion],
    );
    if (rowCount !== 1) return null;

    const last = await this.tx.query<{ n: number | null }>(
      `select max(period_number) as n from app.subscription_periods where subscription_id = $1`,
      [id],
    );
    const previous = last.rows[0]?.n ?? 0;
    if (previous > 0) {
      await this.tx.query(
        `update app.subscription_periods
            set renewal_outcome = 'renewed', outcome_reason = null,
                confirmed_at = $2, confirmed_by = $3
          where subscription_id = $1 and period_number = $4`,
        [id, p.confirmedAt, updatedBy, previous],
      );
    }
    await this.tx.query(
      `insert into app.subscription_periods
         (subscription_id, period_number, start_date, end_date, billing_cycle,
          custom_cycle_months, price_amount, currency, supplier_cost_amount,
          payment_status, renewal_outcome, contract_reference, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'COP', $8, $9, 'pending', $10, $11)`,
      [
        id,
        previous + 1,
        p.startDate,
        p.endDate,
        p.billingCycle,
        p.customCycleMonths,
        p.priceAmount,
        p.supplierCostAmount,
        p.paymentStatus,
        p.contractReference,
        updatedBy,
      ],
    );
    return loadView(this.tx, id);
  }
}

export class PgStartRenewalRepository implements StartRenewalRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
  async startRenewal(
    id: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<SubscriptionView | null> {
    const { rowCount } = await this.tx.query(
      `update app.subscriptions
          set status = 'in_renewal', follow_up_status = 'in_progress',
              version = version + 1, updated_by = $2
        where id = $1 and version = $3`,
      [id, updatedBy, expectedVersion],
    );
    return rowCount === 1 ? loadView(this.tx, id) : null;
  }
}

export class PgMarkNotRenewedRepository implements MarkNotRenewedRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
  async markNotRenewed(
    id: string,
    expectedVersion: number,
    p: MarkNotRenewedParams,
    updatedBy: string,
  ): Promise<SubscriptionView | null> {
    const { rowCount } = await this.tx.query(
      `update app.subscriptions
          set status = coalesce($2::app.subscription_status, status),
              follow_up_status = 'closed', version = version + 1, updated_by = $3
        where id = $1 and version = $4`,
      [id, p.immediateStatus, updatedBy, expectedVersion],
    );
    if (rowCount !== 1) return null;

    const period = await this.tx.query(
      `update app.subscription_periods
          set renewal_outcome = 'not_renewed', outcome_reason = $3,
              confirmed_at = $4, confirmed_by = $5
        where id = $1 and subscription_id = $2`,
      [p.periodId, id, p.reason, p.confirmedAt, updatedBy],
    );
    if (period.rowCount !== 1) return null;
    return loadView(this.tx, id);
  }
}

export class PgCorrectExpirationRepository implements CorrectExpirationRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<SubscriptionView | null> {
    return loadView(this.tx, id);
  }
  async correctExpiration(
    id: string,
    expectedVersion: number,
    p: CorrectExpirationParams,
    updatedBy: string,
  ): Promise<SubscriptionView | null> {
    const { rowCount } = await this.tx.query(
      `update app.subscriptions
          set current_period_end = $2, version = version + 1, updated_by = $3
        where id = $1 and version = $4`,
      [id, p.newCurrentPeriodEnd, updatedBy, expectedVersion],
    );
    if (rowCount !== 1) return null;

    const period = await this.tx.query(
      `update app.subscription_periods
          set end_date = $3
        where id = $1 and subscription_id = $2`,
      [p.periodId, id, p.newCurrentPeriodEnd],
    );
    if (period.rowCount !== 1) return null;
    return loadView(this.tx, id);
  }
}

export class PgUpdatePeriodPaymentRepository implements UpdatePeriodPaymentRepository {
  constructor(private readonly tx: Tx) {}
  async loadPeriodForUpdate(
    subscriptionId: string,
    periodId: string,
  ): Promise<SubscriptionPeriodView | null> {
    const { rows } = await this.tx.query<PeriodRow>(
      `${PERIOD_SELECT} where sp.id = $1 and sp.subscription_id = $2 for update of sp`,
      [periodId, subscriptionId],
    );
    return rows[0] ? toPeriodView(rows[0]) : null;
  }
  async updatePayment(
    subscriptionId: string,
    periodId: string,
    p: PeriodPaymentPatch,
    _updatedBy: string,
  ): Promise<SubscriptionPeriodView | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (p.paymentStatus !== undefined) set('payment_status', p.paymentStatus);
    if (p.contractReference !== undefined) set('contract_reference', p.contractReference);
    if (sets.length === 0) return this.loadPeriodForUpdate(subscriptionId, periodId);

    values.push(periodId);
    const idParam = values.length;
    values.push(subscriptionId);
    const subParam = values.length;
    const { rowCount } = await this.tx.query(
      `update app.subscription_periods
          set ${sets.join(', ')}
        where id = $${idParam} and subscription_id = $${subParam}`,
      values,
    );
    if (rowCount !== 1) return null;
    return this.loadPeriodForUpdate(subscriptionId, periodId);
  }
}
