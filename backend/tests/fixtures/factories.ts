import { faker } from '@faker-js/faker/locale/es';
import type { AccessTokenService } from '../../src/application/auth/ports.js';
import { buildTokenService } from '../../src/composition/pg-infra.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { testEnvSource } from '../helpers/env.js';
import { withOwnerSystemContext } from '../helpers/db.js';

const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

export function nitCheckDigit(baseDigits: string): number {
  let sum = 0;
  for (let i = 0; i < baseDigits.length; i++) {
    sum += Number(baseDigits[baseDigits.length - 1 - i]) * NIT_WEIGHTS[i]!;
  }
  const mod = sum % 11;
  return mod > 1 ? 11 - mod : mod;
}

export function formatColombianNit(baseDigits: string): string {
  const base = baseDigits.replace(/\D/g, '').slice(-9).padStart(9, '0');
  const dv = nitCheckDigit(base);
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${dv}`;
}

export function normalizeTaxIdDigits(taxId: string): string {
  const digits = taxId.replace(/\D/g, '');
  return digits.slice(0, -1) || digits;
}

export type FactoryClient = {
  id: string;
  legalName: string;
  taxId: string | null;
  taxIdNormalized: string | null;
  status: 'active' | 'inactive' | 'archived';
};

export type FactoryUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'operator' | 'client';
  clientId: string | null;
  password: string;
};

export type FactoryProduct = {
  id: string;
  name: string;
  productType: 'third_party' | 'own' | 'recurring_service';
  status: 'active' | 'inactive';
};

export type FactorySubscription = {
  id: string;
  clientId: string;
  productId: string;
  status: string;
  startDate: string;
  currentPeriodEnd: string;
  billingCycle: string;
  priceAmount: string;
};

export type FactoryContact = {
  id: string;
  clientId: string;
  fullName: string;
  email: string;
  isPrimary: boolean;
};

export type FactoryRenewalRequest = {
  id: string;
  subscriptionId: string;
  clientId: string;
  status: string;
};

function monthEndInclusive(startIso: string): string {
  const d = new Date(`${startIso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export type Factories = ReturnType<typeof createFactories>;

export function createFactories(options: { seed?: number; tokens?: AccessTokenService } = {}) {
  const seed = options.seed ?? 42;
  let tokens = options.tokens;

  const reseed = () => {
    faker.seed(seed);
  };
  reseed();

  async function tokenService(): Promise<AccessTokenService> {
    tokens ??= await buildTokenService(loadEnv(testEnvSource()));
    return tokens;
  }

  async function client(
    overrides: Partial<{ status: FactoryClient['status']; document: string | null }> = {},
  ): Promise<FactoryClient> {
    const legalName = faker.company.name();
    const base = faker.string.numeric(9);
    const taxId =
      overrides.document === null ? null : formatColombianNit(overrides.document ?? base);
    const status = overrides.status ?? 'active';
    const archivedAt = status === 'archived' ? new Date().toISOString() : null;
    return withOwnerSystemContext(async (c) => {
      const id = faker.string.uuid();
      const { rows } = await c.query<FactoryClient>(
        `insert into app.clients (id, legal_name, tax_id, status, archived_at)
         values ($1, $2, $3, $4, $5)
         returning id, legal_name as "legalName", tax_id as "taxId", status`,
        [id, legalName, taxId, status, archivedAt],
      );
      const row = rows[0]!;
      return {
        ...row,
        taxIdNormalized: taxId ? normalizeTaxIdDigits(taxId) : null,
      };
    });
  }

  async function user(
    overrides: Partial<{
      role: FactoryUser['role'];
      clientId: string | null;
      email: string;
      password: string;
    }> = {},
  ): Promise<FactoryUser> {
    const role = overrides.role ?? 'admin';
    const email = overrides.email ?? faker.internet.email().toLowerCase();
    const fullName = faker.person.fullName();
    const password = overrides.password ?? faker.internet.password({ length: 14 });
    const clientId = role === 'client' ? (overrides.clientId ?? null) : null;
    if (role === 'client' && !clientId) throw new Error('clientUser requiere clientId');
    return withOwnerSystemContext(async (c) => {
      const id = faker.string.uuid();
      const { rows } = await c.query<FactoryUser>(
        `insert into app.users (id, email, full_name, password_hash, role, client_id, must_change_password, status)
         values ($1, $2, $3, $4, $5, $6, false, 'active')
         returning id, email, full_name as "fullName", role, client_id as "clientId"`,
        [id, email, fullName, `h:${password}`, role, clientId],
      );
      return { ...rows[0]!, password };
    });
  }

  async function contact(
    parent: FactoryClient,
    overrides: Partial<{ isPrimary: boolean; archived: boolean }> = {},
  ): Promise<FactoryContact> {
    const isPrimary = overrides.isPrimary ?? false;
    const archivedAt = overrides.archived ? new Date().toISOString() : null;
    return withOwnerSystemContext(async (c) => {
      const id = faker.string.uuid();
      const { rows } = await c.query<FactoryContact>(
        `insert into app.client_contacts (id, client_id, full_name, email, phone, is_primary, archived_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, client_id as "clientId", full_name as "fullName", email, is_primary as "isPrimary"`,
        [
          id,
          parent.id,
          faker.person.fullName(),
          faker.internet.email().toLowerCase(),
          faker.phone.number(),
          isPrimary,
          archivedAt,
        ],
      );
      return rows[0]!;
    });
  }

  async function product(
    overrides: Partial<{
      type: FactoryProduct['productType'];
      status: FactoryProduct['status'];
    }> = {},
  ): Promise<FactoryProduct> {
    const productType = overrides.type ?? 'third_party';
    const status = overrides.status ?? 'active';
    return withOwnerSystemContext(async (c) => {
      const id = faker.string.uuid();
      const { rows } = await c.query<FactoryProduct>(
        `insert into app.products (id, name, product_type, status)
         values ($1, $2, $3, $4)
         returning id, name, product_type as "productType", status`,
        [id, faker.commerce.productName(), productType, status],
      );
      return rows[0]!;
    });
  }

  async function subscription(
    parentClient: FactoryClient,
    parentProduct: FactoryProduct,
    overrides: Partial<{
      status: string;
      billingCycle: 'monthly' | 'annual';
      startDate: string;
      price: number;
    }> = {},
  ): Promise<FactorySubscription> {
    const startDate = overrides.startDate ?? '2026-11-01';
    const billingCycle = overrides.billingCycle ?? 'monthly';
    const end = monthEndInclusive(startDate);
    const price = overrides.price ?? faker.number.int({ min: 100_000, max: 2_000_000 });
    const status = overrides.status ?? 'pending_activation';
    return withOwnerSystemContext(async (c) => {
      const id = faker.string.uuid();
      const { rows } = await c.query<FactorySubscription>(
        `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
           price_amount, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, client_id as "clientId", product_id as "productId", status, start_date as "startDate",
                   current_period_end as "currentPeriodEnd", billing_cycle as "billingCycle",
                   price_amount::text as "priceAmount"`,
        [id, parentClient.id, parentProduct.id, startDate, end, billingCycle, price, status],
      );
      const sub = rows[0]!;
      await c.query(
        `insert into app.subscription_periods (subscription_id, period_number, start_date, end_date, billing_cycle, price_amount)
         values ($1, 1, $2, $3, $4, $5)`,
        [sub.id, startDate, end, billingCycle, price],
      );
      return sub;
    });
  }

  async function period(
    sub: FactorySubscription,
    overrides: Partial<{
      startDate: string;
      endDate: string;
      priceAmount: number;
      paymentStatus: string;
    }> = {},
  ): Promise<{ periodNumber: number; startDate: string; endDate: string }> {
    return withOwnerSystemContext(async (c) => {
      const last = await c.query<{ n: number; end: string }>(
        `select coalesce(max(period_number), 0) as n,
                coalesce(max(end_date)::text, $2) as end
         from app.subscription_periods where subscription_id = $1`,
        [sub.id, sub.startDate],
      );
      const prevEnd = last.rows[0]!.end;
      const start =
        overrides.startDate ??
        (() => {
          const d = new Date(`${prevEnd}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
      const endDate = overrides.endDate ?? monthEndInclusive(start);
      const periodNumber = last.rows[0]!.n + 1;
      const price = overrides.priceAmount ?? Number(sub.priceAmount);
      const paymentStatus = overrides.paymentStatus ?? 'pending';
      await c.query(
        `insert into app.subscription_periods (subscription_id, period_number, start_date, end_date, billing_cycle,
           price_amount, payment_status)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [sub.id, periodNumber, start, endDate, sub.billingCycle, price, paymentStatus],
      );
      await c.query(`update app.subscriptions set current_period_end = $2 where id = $1`, [
        sub.id,
        endDate,
      ]);
      return { periodNumber, startDate: start, endDate };
    });
  }

  async function renewalRequest(
    sub: FactorySubscription,
    overrides: Partial<{ status: string; requestedByUserId: string }> = {},
  ): Promise<FactoryRenewalRequest> {
    const status = overrides.status ?? 'pending_review';
    const requester =
      overrides.requestedByUserId ?? (await user({ role: 'client', clientId: sub.clientId })).id;
    return withOwnerSystemContext(async (c) => {
      const id = faker.string.uuid();
      const { rows } = await c.query<FactoryRenewalRequest>(
        `insert into app.renewal_requests (id, subscription_id, client_id, requested_by_user_id, status)
         values ($1, $2, $3, $4, $5)
         returning id, subscription_id as "subscriptionId", client_id as "clientId", status`,
        [id, sub.id, sub.clientId, requester, status],
      );
      return rows[0]!;
    });
  }

  async function bulkClients(count: number): Promise<{ inserted: number }> {
    return withOwnerSystemContext(async (c) => {
      reseed();
      const batchSize = 250;
      for (let offset = 0; offset < count; offset += batchSize) {
        const lines: string[] = [];
        const contactLines: string[] = [];
        const limit = Math.min(batchSize, count - offset);
        for (let i = 0; i < limit; i++) {
          const id = faker.string.uuid();
          let name = faker.company.name();
          if ((offset + i) % 10 < 3) name = `${name} ñ ${faker.location.city()}`;
          const archived = (offset + i) % 20 === 0;
          const status = archived ? 'archived' : 'active';
          const tax = formatColombianNit(faker.string.numeric(9));
          const archivedAt = archived ? `'2026-01-01'` : 'null';
          lines.push(
            `('${id}', '${name.replace(/'/g, "''")}', '${tax}', '${status}', ${archivedAt})`,
          );
          for (let k = 0; k < 2; k++) {
            contactLines.push(
              `('${faker.string.uuid()}', '${id}', '${faker.person.fullName().replace(/'/g, "''")}', '${faker.internet.email()}', '3000000000', ${k === 0})`,
            );
          }
        }
        await c.query(
          `insert into app.clients (id, legal_name, tax_id, status, archived_at) values ${lines.join(',')}`,
        );
        await c.query(
          `insert into app.client_contacts (id, client_id, full_name, email, phone, is_primary) values ${contactLines.join(',')}`,
        );
      }
      return { inserted: count };
    });
  }

  return {
    reseed,
    client,
    user,
    adminUser: () => user({ role: 'admin' }),
    operatorUser: () => user({ role: 'operator' }),
    clientUser: (parent: FactoryClient) => user({ role: 'client', clientId: parent.id }),
    tokenFor: async (u: FactoryUser) => {
      const svc = await tokenService();
      const issued = await svc.issue({
        userId: u.id,
        role: u.role,
        clientId: u.clientId,
      });
      return issued.token;
    },
    contact,
    product,
    subscription,
    period,
    renewalRequest,
    bulkClients,
  };
}

export const defaultFactories = createFactories();
