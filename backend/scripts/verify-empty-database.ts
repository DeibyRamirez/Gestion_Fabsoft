/**
 * Verifica que una base recién migrada no tenga datos seed/demo.
 *
 * Uso:
 *   pnpm --filter @fabsoft/backend db:verify:empty -- --before-admin
 *   pnpm --filter @fabsoft/backend db:verify:empty -- --after-admin
 *
 * --before-admin: exige 0 usuarios y 0 datos de negocio.
 * --after-admin:  exige exactamente 1 admin real y 0 datos de negocio.
 *
 * Las tablas de referencia (alert_rules y app_settings) sí deben existir.
 */
import pg from 'pg';

const afterAdmin = process.argv.includes('--after-admin');
const url = process.env.DATABASE_PROVISION_URL ?? process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error('Configura DATABASE_PROVISION_URL o DATABASE_MIGRATION_URL.');

function sslOptions(): pg.ClientConfig['ssl'] | undefined {
  const mode = process.env.DATABASE_SSL_MODE ?? 'disable';
  if (mode === 'disable') return undefined;
  if (mode === 'require') return { rejectUnauthorized: false };
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n');
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

const client = new pg.Client({
  connectionString: url,
  ...(sslOptions() ? { ssl: sslOptions() } : {}),
});
await client.connect();

try {
  const { rows: countRows } = await client.query<Record<string, string>>(`
    select
      (select count(*) from app.users)::text as users,
      (select count(*) from app.clients)::text as clients,
      (select count(*) from app.products)::text as products,
      (select count(*) from app.subscriptions)::text as subscriptions,
      (select count(*) from app.subscription_periods)::text as subscription_periods,
      (select count(*) from app.client_contacts)::text as client_contacts,
      (select count(*) from app.client_notes)::text as client_notes,
      (select count(*) from app.renewal_requests)::text as renewal_requests,
      (select count(*) from app.tasks)::text as tasks,
      (select count(*) from app.notifications)::text as notifications,
      (select count(*) from app.integrations)::text as integrations,
      (select count(*) from app.api_credentials)::text as api_credentials,
      (select count(*) from app.refresh_tokens)::text as refresh_tokens,
      (select count(*) from app.idempotency_keys)::text as idempotency_keys,
      (select count(*) from app.audit_logs)::text as audit_logs,
      (select count(*) from app.alert_rules)::text as alert_rules,
      (select count(*) from app.app_settings)::text as app_settings
  `);

  const { rows: demoRows } = await client.query<Record<string, string>>(`
    select
      (select count(*) from app.users where email like '%@fabsoft.test')::text as demo_users,
      (select count(*) from app.clients
        where legal_name like 'Distribuidora Andina%'
           or legal_name like 'Caf%El Cafetal%'
           or legal_name like 'Cl%nica Norte%')::text as demo_clients
  `);

  const { rows: adminRows } = await client.query<{ email: string; role: string }>(`
    select email, role::text as role
      from app.users
     order by created_at
     limit 1
  `);

  const counts = countRows[0] ?? {};
  const demo = demoRows[0] ?? {};
  const failures: string[] = [];
  const n = (key: string): number => Number(counts[key] ?? 0);

  if (afterAdmin) {
    if (n('users') !== 1) failures.push(`users=${n('users')} (se esperaba 1 admin)`);
    if (adminRows[0]?.role !== 'admin') failures.push('el único usuario no es admin');
    if (!adminRows[0]?.email) failures.push('no se encontró el correo del admin');
    else if (adminRows[0].email.endsWith('@fabsoft.test')) {
      failures.push('el admin usa un correo de seed (@fabsoft.test)');
    }
    if (n('audit_logs') < 1) failures.push('falta el evento de auditoría del bootstrap');
  } else {
    if (n('users') !== 0) failures.push(`users=${n('users')} (se esperaba 0)`);
    if (n('audit_logs') !== 0) failures.push(`audit_logs=${n('audit_logs')} (se esperaba 0)`);
  }

  for (const key of [
    'clients',
    'products',
    'subscriptions',
    'subscription_periods',
    'client_contacts',
    'client_notes',
    'renewal_requests',
    'tasks',
    'notifications',
    'integrations',
    'api_credentials',
    'refresh_tokens',
    'idempotency_keys',
  ]) {
    if (n(key) !== 0) failures.push(`${key}=${n(key)} (se esperaba 0)`);
  }

  if (n('alert_rules') === 0) failures.push('faltan alert_rules de referencia');
  if (n('app_settings') === 0) failures.push('falta app_settings de referencia');
  if (Number(demo.demo_users ?? 0) > 0) failures.push('hay usuarios seed (@fabsoft.test)');
  if (Number(demo.demo_clients ?? 0) > 0) failures.push('hay clientes demo');

  const report = {
    msg: failures.length === 0 ? 'db.clean' : 'db.not_clean',
    mode: afterAdmin ? 'after-admin' : 'before-admin',
    counts,
    demo,
    ...(failures.length > 0 ? { failures } : {}),
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await client.end();
}
