/**
 * Chequeos compartidos T-F0-09c / mutación de políticas (portal vs tabla base).
 */
import type pg from 'pg';

export type RlsFixtureIds = {
  clientA: string;
  clientB: string;
  clientUserA: string;
  subA: string;
  subB: string;
  renewalA: string;
  renewalB: string;
  contactB: string;
  taskB: string;
  notifB: string;
};

export const APP_RLS_TABLES = [
  'users',
  'refresh_tokens',
  'clients',
  'client_contacts',
  'client_notes',
  'products',
  'subscriptions',
  'subscription_periods',
  'renewal_requests',
  'tasks',
  'notifications',
  'alert_rules',
  'app_settings',
  'integrations',
  'integration_clients',
  'api_credentials',
  'idempotency_keys',
  'audit_logs',
] as const;

export async function setFabsoftAppClientA(
  c: pg.PoolClient,
  ids: Pick<RlsFixtureIds, 'clientUserA' | 'clientA'>,
): Promise<void> {
  await c.query(`set local role fabsoft_app`);
  await c.query(
    `select set_config('app.actor_type','user',true), set_config('app.actor_role','client',true),
            set_config('app.current_user_id',$1,true), set_config('app.client_id',$2,true),
            set_config('app.integration_id','',true), set_config('app.request_id','test',true)`,
    [ids.clientUserA, ids.clientA],
  );
}

/** Cliente A ve fila de suscripción B en tabla base (fuga). */
export async function clientLeaksSubscriptionBase(
  c: pg.PoolClient,
  otherSubId: string,
): Promise<boolean> {
  const { rows } = await c.query<{ id: string }>(
    `select id from app.subscriptions where id = $1`,
    [otherSubId],
  );
  return rows.length > 0;
}

/** Cliente A ve suscripción B vía vista portal (fuga). */
export async function clientLeaksPortalSubscription(
  c: pg.PoolClient,
  otherSubId: string,
): Promise<boolean> {
  const { rows } = await c.query<{ id: string }>(
    `select id from app.portal_subscriptions where id = $1`,
    [otherSubId],
  );
  return rows.length > 0;
}

export async function clientLeaksStaffRow(
  c: pg.PoolClient,
  table: string,
  rowId: string,
): Promise<boolean> {
  const { rows } = await c.query<{ id: string }>(
    `select id from app.${table} where id = $1`,
    [rowId],
  );
  return rows.length > 0;
}

/** Aserciones de aislamiento correcto (sin fuga) — fallan si hay USING(true). */
export async function assertClientIsolationNoLeak(
  c: pg.PoolClient,
  ids: RlsFixtureIds,
): Promise<void> {
  const clients = await c.query<{ id: string }>(
    `select id from app.clients where id in ($1,$2) order by id`,
    [ids.clientA, ids.clientB],
  );
  if (clients.rows.map((r) => r.id).join(',') !== ids.clientA) {
    throw new Error(`clients: esperaba sólo A, obtuvo ${JSON.stringify(clients.rows)}`);
  }

  if ((await c.query(`select id from app.subscriptions`)).rowCount !== 0) {
    throw new Error('subscriptions base: cliente debe ver 0 filas (T-SEC-18)');
  }
  const portal = await c.query<{ id: string }>(`select id from app.portal_subscriptions`);
  if (portal.rowCount !== 1 || portal.rows[0]!.id !== ids.subA) {
    throw new Error(
      `portal_subscriptions: esperaba solo subA, obtuvo ${JSON.stringify(portal.rows)}`,
    );
  }

  const renewal = await c.query<{ id: string }>(
    `select id from app.renewal_requests where id in ($1,$2)`,
    [ids.renewalA, ids.renewalB],
  );
  if (renewal.rows.map((r) => r.id).join(',') !== ids.renewalA) {
    throw new Error(`renewal_requests: fuga B — ${JSON.stringify(renewal.rows)}`);
  }

  for (const table of ['client_contacts', 'client_notes', 'tasks', 'notifications'] as const) {
    if ((await c.query(`select id from app.${table}`)).rowCount !== 0) {
      throw new Error(`${table}: cliente no debe ver filas staff`);
    }
  }

  const upd = await c.query(`update app.renewal_requests set comment = 'hack' where id = $1`, [
    ids.renewalB,
  ]);
  if (upd.rowCount !== 0) {
    throw new Error('renewal_requests: update cross-tenant no bloqueado');
  }
}
