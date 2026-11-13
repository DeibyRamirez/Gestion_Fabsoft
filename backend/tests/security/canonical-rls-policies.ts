import type pg from 'pg';

/** Políticas esperadas tras 0004 (estado canónico para tests de mutación / T-F0-09c). */
export async function restoreCanonicalFabsoftAppPolicies(c: pg.PoolClient): Promise<void> {
  await c.query(`drop policy if exists subscriptions_select on app.subscriptions`);
  await c.query(
    `create policy subscriptions_select on app.subscriptions for select to fabsoft_app
     using (app.is_staff() or app.is_system())`,
  );
  await c.query(`drop policy if exists subscription_periods_select on app.subscription_periods`);
  await c.query(
    `create policy subscription_periods_select on app.subscription_periods for select to fabsoft_app
     using (app.is_staff() or app.is_system())`,
  );
  await c.query(`drop policy if exists client_contacts_select on app.client_contacts`);
  await c.query(
    `create policy client_contacts_select on app.client_contacts for select to fabsoft_app
     using (app.is_staff() or app.is_system() or app.integration_sees_client(client_id))`,
  );
  await c.query(`drop policy if exists tasks_select on app.tasks`);
  await c.query(
    `create policy tasks_select on app.tasks for select to fabsoft_app
     using (app.is_staff() or app.is_system() or app.integration_sees_client(client_id))`,
  );
  await c.query(`drop policy if exists notifications_select on app.notifications`);
  await c.query(
    `create policy notifications_select on app.notifications for select to fabsoft_app
     using (app.is_staff() or app.is_system())`,
  );
}
