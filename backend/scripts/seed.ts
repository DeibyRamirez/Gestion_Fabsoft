/**
 * Datos de desarrollo (docs/seed-data.md). Idempotente (UUID fijos + on conflict do nothing).
 * Conecta con SEED_DATABASE_URL (fabsoft_seed_writer) y usa `SET LOCAL ROLE fabsoft_app` con
 * contexto admin para cumplir RLS (sin superusuario ni BYPASSRLS).
 * Uso: pnpm db:seed [-- --reset]
 * Fuera de alcance aquí: integración de prueba y API key (HU-15, Sprint 3) y alerts.reconcile (worker).
 */
import pg from 'pg';
import { Argon2PasswordHasher } from '../src/infrastructure/security/argon2-password-hasher.js';
import { assertSeedConfiguration, assertSeedSession, resolveGuardedDatabaseUrl } from './guard.js';
import { normalizeDatabaseUrl, redactDatabaseUrl } from './database-url.js';

const seedConfig = assertSeedConfiguration();
const reset = process.argv.includes('--reset');
const url = seedConfig.url;

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const U = {
  admin: id(0x101),
  operator: id(0x102),
  andina: id(0x103),
  cafetal: id(0x104),
  inactive: id(0x105),
};
const C = {
  andina: id(0x201),
  cafetal: id(0x202),
  norte: id(0x203),
  ferreteria: id(0x204),
  textiles: id(0x205),
};
const P = {
  m365: id(0x301),
  eset: id(0x302),
  facturacion: id(0x303),
  soporte: id(0x304),
  hosting: id(0x305),
};

const users = [
  {
    id: U.admin,
    email: 'admin@fabsoft.test',
    name: 'Admin FabSoft',
    role: 'admin',
    client: null,
    pw: 'Admin.dev-2026!',
    must: false,
    status: 'active',
  },
  {
    id: U.operator,
    email: 'operador@fabsoft.test',
    name: 'Operador FabSoft',
    role: 'operator',
    client: null,
    pw: 'Operador.dev-2026!',
    must: false,
    status: 'active',
  },
  {
    id: U.andina,
    email: 'portal@andina.test',
    name: 'Portal Andina',
    role: 'client',
    client: C.andina,
    pw: 'Cliente.dev-2026!',
    must: false,
    status: 'active',
  },
  {
    id: U.cafetal,
    email: 'portal@cafetal.test',
    name: 'Portal Cafetal',
    role: 'client',
    client: C.cafetal,
    pw: 'Cliente.dev-2026!',
    must: true,
    status: 'active',
  },
  {
    id: U.inactive,
    email: 'inactivo@fabsoft.test',
    name: 'Operador Inactivo',
    role: 'operator',
    client: null,
    pw: 'Inactivo.dev-2026!',
    must: false,
    status: 'disabled',
  },
] as const;

const clients = [
  [C.andina, 'Distribuidora Andina S.A.S.', '900.123.456-7', 'active', U.admin],
  [C.cafetal, 'Café El Cafetal Ltda.', '800.987.654-3', 'active', U.operator],
  [C.norte, 'Clínica Norte S.A.', '901.555.222-1', 'active', U.operator],
  [C.ferreteria, 'Ferretería Los Andes', null, 'inactive', null],
  [C.textiles, 'Textiles Antiguos S.A.S.', '830.111.000-9', 'inactive', null],
] as const;

const products = [
  [P.m365, 'Microsoft 365 Business Standard', 'third_party', 'Microsoft', 'active'],
  [P.eset, 'Antivirus ESET Protect Entry', 'third_party', 'ESET', 'active'],
  [P.facturacion, 'FabSoft Facturación', 'own', 'FabSoft', 'active'],
  [P.soporte, 'Soporte técnico mensual', 'recurring_service', 'FabSoft', 'active'],
  [P.hosting, 'Hosting compartido básico', 'recurring_service', 'FabSoft', 'inactive'],
] as const;

type Cycle = 'monthly' | 'quarterly' | 'annual' | 'custom';
const MONTHS: Record<Cycle, number> = { monthly: 1, quarterly: 3, annual: 12, custom: 18 };
interface Sub {
  n: number;
  client: string;
  product: string;
  cycle: Cycle;
  endOffset: number;
  status: string;
  followUp: string;
  payment: string;
  price: number;
  cost?: number;
  periods?: number;
  visible?: boolean;
  lastOutcome?: 'not_renewed';
}
const subs: Sub[] = [
  {
    n: 1,
    client: C.andina,
    product: P.m365,
    cycle: 'annual',
    endOffset: 30,
    status: 'active',
    followUp: 'none',
    payment: 'received',
    price: 1_850_000,
  },
  {
    n: 2,
    client: C.andina,
    product: P.eset,
    cycle: 'annual',
    endOffset: 15,
    status: 'in_renewal',
    followUp: 'in_progress',
    payment: 'received',
    price: 420_000,
    cost: 300_000,
  },
  {
    n: 3,
    client: C.cafetal,
    product: P.facturacion,
    cycle: 'annual',
    endOffset: 7,
    status: 'active',
    followUp: 'awaiting_client',
    payment: 'pending',
    price: 2_400_000,
  },
  {
    n: 4,
    client: C.cafetal,
    product: P.soporte,
    cycle: 'monthly',
    endOffset: 1,
    status: 'active',
    followUp: 'none',
    payment: 'not_tracked',
    price: 350_000,
  },
  {
    n: 5,
    client: C.norte,
    product: P.m365,
    cycle: 'annual',
    endOffset: 0,
    status: 'in_renewal',
    followUp: 'in_progress',
    payment: 'received',
    price: 3_700_000,
    cost: 2_900_000,
  },
  {
    n: 6,
    client: C.norte,
    product: P.eset,
    cycle: 'annual',
    endOffset: -1,
    status: 'expired',
    followUp: 'none',
    payment: 'received',
    price: 840_000,
  },
  {
    n: 7,
    client: C.norte,
    product: P.soporte,
    cycle: 'monthly',
    endOffset: -20,
    status: 'not_renewed',
    followUp: 'closed',
    payment: 'received',
    price: 350_000,
    lastOutcome: 'not_renewed',
  },
  {
    n: 8,
    client: C.andina,
    product: P.soporte,
    cycle: 'quarterly',
    endOffset: 75,
    status: 'active',
    followUp: 'none',
    payment: 'received',
    price: 900_000,
    periods: 3,
  },
  {
    n: 9,
    client: C.cafetal,
    product: P.eset,
    cycle: 'annual',
    endOffset: 340,
    status: 'pending_activation',
    followUp: 'none',
    payment: 'pending',
    price: 420_000,
  },
  {
    n: 10,
    client: C.ferreteria,
    product: P.facturacion,
    cycle: 'annual',
    endOffset: -90,
    status: 'cancelled',
    followUp: 'closed',
    payment: 'received',
    price: 2_400_000,
  },
  {
    n: 11,
    client: C.andina,
    product: P.facturacion,
    cycle: 'custom',
    endOffset: 200,
    status: 'active',
    followUp: 'none',
    payment: 'received',
    price: 3_600_000,
    visible: false,
  },
];
const subId = (n: number) => id(0x400 + n);

const hasher = new Argon2PasswordHasher();
const db = new pg.Client({ connectionString: url });
await db.connect();
const q = (sql: string, params?: unknown[]) => db.query(sql, params);
try {
  await assertSeedSession(q, seedConfig);
  await db.query('begin');
  await db.query('set local role fabsoft_app');
  await db.query(
    `select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
            set_config('app.current_user_id',$1,true), set_config('app.request_id','seed',true)`,
    [U.admin],
  );
  if (reset) {
    const { url: bootstrapUrl } = resolveGuardedDatabaseUrl(['BOOTSTRAP_DATABASE_URL'], {
      allowUsers: ['fabsoft_bootstrap'],
    });
    const boot = new pg.Client({ connectionString: normalizeDatabaseUrl(bootstrapUrl) });
    await boot.connect();
    try {
      await boot.query('begin');
      await boot.query('set local role fabsoft_bootstrap');
      await boot.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await boot.query(`truncate app.tasks, app.renewal_requests, app.subscription_periods, app.subscriptions, app.client_notes,
        app.client_contacts, app.refresh_tokens, app.idempotency_keys, app.notifications, app.audit_logs restart identity cascade`);
      await boot.query(
        `update app.clients set owner_user_id = null, created_by = null, updated_by = null`,
      );
      await boot.query(`truncate app.users, app.clients, app.products cascade`);
      await boot.query('commit');
    } finally {
      await boot.end();
    }
  }
  const { rows } = await db.query<{ today: string }>(
    `select (now() at time zone 'America/Bogota')::date::text as today`,
  );
  const today = rows[0]!.today;

  for (const [cid, name, tax, status, owner] of clients) {
    await db.query(
      `insert into app.clients (id, legal_name, tax_id, status, archived_at) values ($1, $2, $3, $4::app.client_status, case when $4::text = 'archived' then now() end)
       on conflict (id) do nothing`,
      [cid, name, tax, status],
    );
    void owner;
  }
  for (const u of users) {
    await db.query(
      `insert into app.users (id, email, full_name, password_hash, role, client_id, status, must_change_password)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
      [u.id, u.email, u.name, await hasher.hash(u.pw), u.role, u.client, u.status, u.must],
    );
  }
  for (const [cid, , , , owner] of clients) {
    if (owner)
      await db.query(
        `update app.clients set owner_user_id = $2 where id = $1 and owner_user_id is null`,
        [cid, owner],
      );
  }
  await db.query(
    `update app.clients set status = 'archived'::app.client_status, archived_at = now()
     where id = $1 and status <> 'archived'::app.client_status`,
    [C.textiles],
  );
  await db.query(
    `insert into app.client_contacts (id, client_id, full_name, email, phone, role_title, is_primary) values
       ($1, $4, 'Laura Gómez', 'laura@andina.test', '+57 300 000 0001', 'Gerente TI', true),
       ($2, $4, 'Pedro Ruiz', 'compras@andina.test', null, 'Compras', false),
       ($3, $5, 'Ana Cafetal', 'ana@cafetal.test', '+57 300 000 0002', 'Administradora', true),
       ($6, $7, 'Dr. Mario Norte', null, '+57 300 000 0003', 'Director', true)
     on conflict (id) do nothing`,
    [id(0x501), id(0x502), id(0x503), C.andina, C.cafetal, id(0x504), C.norte],
  );
  await db.query(
    `insert into app.client_notes (id, client_id, author_user_id, body) values
       ($1, $2, $3, 'Cliente estratégico: priorizar renovaciones.')
     on conflict (id) do nothing`,
    [id(0x511), C.andina, U.admin],
  );
  await db.query(
    `select set_config('app.actor_type','user',true), set_config('app.actor_role','operator',true),
            set_config('app.current_user_id',$1,true), set_config('app.request_id','seed',true)`,
    [U.operator],
  );
  await db.query(
    `insert into app.client_notes (id, client_id, author_user_id, body) values
       ($1, $2, $3, 'Prefiere contacto por correo.'),
       ($4, $5, $3, 'Pendiente propuesta de ampliación de licencias.')
     on conflict (id) do nothing`,
    [id(0x512), C.andina, U.operator, id(0x513), C.norte],
  );
  await db.query(
    `select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
            set_config('app.current_user_id',$1,true), set_config('app.request_id','seed',true)`,
    [U.admin],
  );
  for (const [pid, name, type, vendor, status] of products) {
    await db.query(
      `insert into app.products (id, name, product_type, vendor, status) values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
      [pid, name, type, vendor, status],
    );
  }

  for (const s of subs) {
    const months = MONTHS[s.cycle];
    const nPeriods = s.periods ?? 1;
    const end = `($1::date + ${s.endOffset})`;
    const startOf = (k: number) =>
      `(${end} - interval '${months * (nPeriods - k + 1)} months' + interval '1 day')::date`;
    const insertStatus =
      s.status === 'pending_activation' || s.status === 'active' ? s.status : 'active';
    const inserted = await db.query(
      `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle, custom_cycle_months,
         price_amount, supplier_cost_amount, status, follow_up_status, visible_in_portal, owner_user_id, contract_reference)
       values ($2, $3, $4, ${startOf(1)}, ${end}, $5, $6, $7, $8, $9::app.subscription_status, $10, $11, $12, $13)
       on conflict (id) do nothing`,
      [
        today,
        subId(s.n),
        s.client,
        s.product,
        s.cycle,
        s.cycle === 'custom' ? 18 : null,
        s.price,
        s.cost ?? null,
        insertStatus,
        s.followUp,
        s.visible ?? true,
        U.operator,
        `CT-${String(s.n).padStart(3, '0')}`,
      ],
    );
    if (inserted.rowCount === 0) continue;
    if (insertStatus !== s.status) {
      await db.query(
        `update app.subscriptions set status = $2::app.subscription_status,
           cancelled_at = case when $2::text = 'cancelled' then now() end,
           cancellation_reason = case when $2::text = 'cancelled' then 'Cliente cerró operaciones' end
         where id = $1`,
        [subId(s.n), s.status],
      );
    }
    for (let k = 1; k <= nPeriods; k++) {
      const last = k === nPeriods;
      const outcome = last ? (s.lastOutcome ?? 'pending') : 'renewed';
      await db.query(
        `insert into app.subscription_periods (id, subscription_id, period_number, start_date, end_date, billing_cycle, custom_cycle_months,
           price_amount, supplier_cost_amount, renewal_outcome, outcome_reason, payment_status, confirmed_at, confirmed_by)
         values ($2, $3, $4, ${startOf(k)}, (${startOf(k + 1)} - 1), $5, $6, $7, $8, $9::app.renewal_outcome, $10, $11,
           case when $9::text <> 'pending' then now() end, case when $9::text <> 'pending' then $12::uuid end)
         on conflict (id) do nothing`,
        [
          today,
          id(0x600 + s.n * 10 + k),
          subId(s.n),
          k,
          s.cycle,
          s.cycle === 'custom' ? 18 : null,
          s.price,
          s.cost ?? null,
          outcome,
          outcome === 'not_renewed' ? 'El cliente decidió no continuar' : null,
          last ? s.payment : 'received',
          U.operator,
        ],
      );
    }
  }

  await db.query(
    `select set_config('app.actor_type','user',true), set_config('app.actor_role','client',true),
            set_config('app.current_user_id',$1,true), set_config('app.client_id',$2,true),
            set_config('app.request_id','seed',true)`,
    [U.andina, C.andina],
  );
  await db.query(
    `insert into app.renewal_requests (id, subscription_id, client_id, requested_by_user_id, comment)
     values ($1, $2, $3, $4, 'Queremos renovar por un año más.') on conflict (id) do nothing`,
    [id(0x701), subId(2), C.andina, U.andina],
  );
  await db.query(
    `select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
            set_config('app.current_user_id',$1,true), set_config('app.client_id','',true),
            set_config('app.request_id','seed',true)`,
    [U.admin],
  );
  const task = (
    n: number,
    type: string,
    sub: number,
    client: string,
    due: number,
    title: string,
    status = 'pending',
  ) =>
    db.query(
      `insert into app.tasks (id, task_type, client_id, subscription_id, assignee_user_id, due_date, title, status, completed_at)
       values ($1, $2, $3, $4, $5, $6::date + $7::int, $8, $9::app.task_status, case when $9::text = 'completed' then now() end) on conflict (id) do nothing`,
      [id(0x800 + n), type, client, subId(sub), U.operator, today, due, title, status],
    );
  await task(1, 'send_proposal', 1, C.andina, 5, 'Enviar propuesta de renovación M365');
  await task(2, 'contact_client', 2, C.andina, 2, 'Contactar a Andina por renovación ESET');
  await task(3, 'review_expired', 6, C.norte, 0, 'Revisar suscripción ESET vencida');
  await task(4, 'other', 8, C.andina, -30, 'Confirmar pago del trimestre anterior', 'completed');

  await db.query('commit');
  console.log(`Seed aplicado (hoy=${today}) en ${redactDatabaseUrl(url)}.`);
  if (process.env.APP_ENV === 'dev') {
    console.log('Credenciales de desarrollo (ver docs/seed-data.md):');
    for (const u of users)
      console.log(
        `  ${u.email.padEnd(24)} ${u.role.padEnd(9)}${u.status === 'disabled' ? ' (desactivado)' : ''}${u.must ? ' (cambio obligatorio)' : ''}`,
      );
  }
} catch (err) {
  await db.query('rollback').catch(() => undefined);
  throw err;
} finally {
  await db.end();
}
