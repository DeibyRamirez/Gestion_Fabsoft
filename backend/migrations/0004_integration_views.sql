-- migrate:up
-- =============================================================================
-- FabSoft · 0004_integration_views.sql
-- Matriz de permisos, nota 2: las integraciones nunca reciben supplier_cost_amount ni notes.
-- Mismo patrón que 0003 (M3): la integración deja de leer las tablas base
-- subscriptions/subscription_periods y lee vistas security_barrier propiedad de
-- fabsoft_secure_view, que además exigen el scope `subscriptions:read` y respetan
-- client_scope (all | own vía integration_clients).
--
-- CONTRATO REPOSITORY (integración, actor_type='integration'):
--   * Leer app.integration_subscriptions y app.integration_subscription_periods.
--   * Las tablas base devuelven 0 filas a la integración.
--   * Sin el scope subscriptions:read las vistas devuelven 0 filas (la API ya responde 403
--     insufficient_scope antes; RLS es la segunda barrera).
-- =============================================================================
set local search_path = app, pg_catalog;

-- El propietario de las vistas necesita evaluar el alcance de la integración.
grant execute on function app.ctx_integration_id(), app.is_integration(), app.integration_sees_client(uuid)
  to fabsoft_secure_view;
grant select (id, status, scopes, client_scope) on app.integrations to fabsoft_secure_view;
grant select (integration_id, client_id) on app.integration_clients to fabsoft_secure_view;
create policy integrations_select_secure_view on app.integrations for select to fabsoft_secure_view
  using (app.is_integration() and id = app.ctx_integration_id());
create policy integration_clients_select_secure_view on app.integration_clients for select to fabsoft_secure_view
  using (app.is_integration() and integration_id = app.ctx_integration_id());

-- ¿La integración del contexto puede leer suscripciones de este cliente? (scope + alcance)
create or replace function app.integration_reads_subscriptions(p_client_id uuid) returns boolean
language sql stable security definer set search_path = app, pg_catalog as $$
  select app.integration_sees_client(p_client_id) and exists (
    select 1 from app.integrations i
     where i.id = app.ctx_integration_id() and 'subscriptions:read' = any (i.scopes)) $$;
alter function app.integration_reads_subscriptions(uuid) owner to fabsoft_secure_view;
revoke execute on function app.integration_reads_subscriptions(uuid) from public;
grant execute on function app.integration_reads_subscriptions(uuid) to fabsoft_app, fabsoft_secure_view;

-- Columnas adicionales visibles para integraciones (las del portal ya se concedieron en 0003).
grant select (follow_up_status, owner_user_id) on app.subscriptions to fabsoft_secure_view;
grant select (outcome_reason, payment_status, confirmed_at, updated_at) on app.subscription_periods to fabsoft_secure_view;

create policy subscriptions_select_secure_view_integration on app.subscriptions for select to fabsoft_secure_view
  using (app.integration_reads_subscriptions(client_id));
-- subscription_periods_select_secure_view (0003) ya delega en la visibilidad de subscriptions para este rol.

-- Tablas base: sin rama de integración.
drop policy subscriptions_select on app.subscriptions;
create policy subscriptions_select on app.subscriptions for select to fabsoft_app
  using (app.is_staff() or app.is_system());
drop policy subscription_periods_select on app.subscription_periods;
create policy subscription_periods_select on app.subscription_periods for select to fabsoft_app
  using (app.is_staff() or app.is_system());

create view app.integration_subscriptions with (security_barrier = true) as
  select id, client_id, product_id, contract_reference, start_date, current_period_end, billing_cycle,
         custom_cycle_months, price_amount, currency, renewal_terms, is_renewable, status, follow_up_status,
         visible_in_portal, owner_user_id, created_at, updated_at
    from app.subscriptions
   where app.integration_reads_subscriptions(client_id);
create view app.integration_subscription_periods with (security_barrier = true) as
  select p.id, p.subscription_id, p.period_number, p.start_date, p.end_date, p.billing_cycle,
         p.custom_cycle_months, p.price_amount, p.currency, p.renewal_outcome, p.outcome_reason,
         p.payment_status, p.confirmed_at, p.contract_reference, p.created_at, p.updated_at
    from app.subscription_periods p
    join app.subscriptions s on s.id = p.subscription_id
   where app.integration_reads_subscriptions(s.client_id);
alter view app.integration_subscriptions owner to fabsoft_secure_view;
alter view app.integration_subscription_periods owner to fabsoft_secure_view;
revoke all on app.integration_subscriptions, app.integration_subscription_periods from public;
grant select on app.integration_subscriptions, app.integration_subscription_periods to fabsoft_app;

select app.assert_rls_everywhere();

-- migrate:down
-- Vuelve al estado de 0003. No desactiva RLS ni FORCE.
set local search_path = app, pg_catalog;
drop view if exists app.integration_subscription_periods;
drop view if exists app.integration_subscriptions;
drop policy if exists subscriptions_select on app.subscriptions;
create policy subscriptions_select on app.subscriptions for select to fabsoft_app
  using (app.is_staff() or app.is_system() or app.integration_sees_client(client_id));
drop policy if exists subscription_periods_select on app.subscription_periods;
create policy subscription_periods_select on app.subscription_periods for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or exists (select 1 from app.subscriptions s
                     where s.id = subscription_periods.subscription_id
                       and app.integration_sees_client(s.client_id)));
drop policy if exists subscriptions_select_secure_view_integration on app.subscriptions;
drop function if exists app.integration_reads_subscriptions(uuid);
drop policy if exists integration_clients_select_secure_view on app.integration_clients;
drop policy if exists integrations_select_secure_view on app.integrations;
revoke select (follow_up_status, owner_user_id) on app.subscriptions from fabsoft_secure_view;
revoke select (outcome_reason, payment_status, confirmed_at, updated_at) on app.subscription_periods from fabsoft_secure_view;
revoke select (id, status, scopes, client_scope) on app.integrations from fabsoft_secure_view;
revoke select (integration_id, client_id) on app.integration_clients from fabsoft_secure_view;
revoke execute on function app.ctx_integration_id(), app.is_integration(), app.integration_sees_client(uuid)
  from fabsoft_secure_view;
