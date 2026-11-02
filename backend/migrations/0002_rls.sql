-- migrate:up
-- =============================================================================
-- FabSoft · 0002_rls.sql
-- Rol de ejecución, permisos, funciones de contexto y políticas RLS por tabla.
-- Compatible con Supabase y PostgreSQL 16 puro.
--
-- Contrato (ver docs/security/threat-model.md §3 y ADR-004):
--   El backend abre UNA transacción por unidad de trabajo y, antes de cualquier
--   consulta, fija con set_config(..., true) (equivalente a SET LOCAL):
--     app.actor_type        'user' | 'integration' | 'system'
--     app.actor_role        'admin' | 'operator' | 'client' | 'integration' | 'system'
--     app.current_user_id   uuid del usuario humano (si actor_type = 'user')
--     app.client_id         uuid del cliente (si actor_role = 'client')
--     app.integration_id    uuid de la integración (si actor_type = 'integration')
--     app.request_id        id de correlación (trazas/auditoría)
--   Sin contexto => las funciones devuelven NULL => ninguna política concede acceso.
--
-- RLS es defensa en profundidad: la autorización principal (rol, scope, columnas
-- sensibles, transiciones de estado) vive en la capa application del backend.
-- =============================================================================

set local search_path = app, pg_catalog;

-- -----------------------------------------------------------------------------
-- 1. Rol de ejecución (sin LOGIN aquí; credenciales se asignan fuera de migraciones)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fabsoft_app') then
    create role fabsoft_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

grant usage on schema app to fabsoft_app;
grant select, insert, update on all tables in schema app to fabsoft_app;
grant usage, select on all sequences in schema app to fabsoft_app;
grant execute on all functions in schema app to fabsoft_app;
-- DELETE sólo donde existe ciclo de vida técnico (tokens, idempotencia, asociaciones).
grant delete on app.refresh_tokens, app.idempotency_keys, app.integration_clients to fabsoft_app;
-- Las tablas históricas no admiten DELETE (además del trigger tg_prevent_delete).
revoke delete, truncate on app.clients, app.users, app.client_contacts, app.client_notes, app.products,
  app.subscriptions, app.subscription_periods, app.renewal_requests, app.tasks, app.notifications,
  app.alert_rules, app.integrations, app.api_credentials, app.audit_logs, app.app_settings from fabsoft_app;
-- audit_logs: append-only para la aplicación.
revoke update on app.audit_logs from fabsoft_app;

-- pg-boss crea su propio esquema `pgboss` al arrancar el worker.
do $$
begin
  execute format('grant create on database %I to fabsoft_app', current_database());
end $$;

-- Portabilidad Supabase: el esquema `app` NO se expone por PostgREST/Data API.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon';
    execute 'revoke all on all tables in schema app from anon';
    execute 'revoke all on all functions in schema app from anon';
    execute 'alter default privileges in schema app revoke all on tables from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema app from authenticated';
    execute 'revoke all on all tables in schema app from authenticated';
    execute 'revoke all on all functions in schema app from authenticated';
    execute 'alter default privileges in schema app revoke all on tables from authenticated';
  end if;
end $$;
revoke all on schema app from public;
revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to fabsoft_app;

-- -----------------------------------------------------------------------------
-- 2. Funciones de contexto (STABLE, SECURITY INVOKER)
-- -----------------------------------------------------------------------------
create or replace function app.ctx_actor_type() returns text
language sql stable as $$ select nullif(current_setting('app.actor_type', true), '') $$;

create or replace function app.ctx_role() returns text
language sql stable as $$ select nullif(current_setting('app.actor_role', true), '') $$;

create or replace function app.ctx_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.current_user_id', true), '')::uuid $$;

create or replace function app.ctx_client_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.client_id', true), '')::uuid $$;

create or replace function app.ctx_integration_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.integration_id', true), '')::uuid $$;

create or replace function app.is_admin() returns boolean
language sql stable as $$ select coalesce(app.ctx_actor_type() = 'user' and app.ctx_role() = 'admin' and app.ctx_user_id() is not null, false) $$;

create or replace function app.is_operator() returns boolean
language sql stable as $$ select coalesce(app.ctx_actor_type() = 'user' and app.ctx_role() = 'operator' and app.ctx_user_id() is not null, false) $$;

create or replace function app.is_staff() returns boolean
language sql stable as $$ select app.is_admin() or app.is_operator() $$;

create or replace function app.is_system() returns boolean
language sql stable as $$ select coalesce(app.ctx_actor_type() = 'system' and app.ctx_role() = 'system', false) $$;

create or replace function app.is_client_user() returns boolean
language sql stable as $$
  select coalesce(app.ctx_actor_type() = 'user' and app.ctx_role() = 'client'
                  and app.ctx_user_id() is not null and app.ctx_client_id() is not null, false) $$;

create or replace function app.is_integration() returns boolean
language sql stable as $$
  select coalesce(app.ctx_actor_type() = 'integration' and app.ctx_role() = 'integration'
                  and app.ctx_integration_id() is not null, false) $$;

-- ¿La integración del contexto puede ver datos de este cliente? (client_scope all|own)
create or replace function app.integration_sees_client(p_client_id uuid) returns boolean
language sql stable as $$
  select app.is_integration() and exists (
    select 1 from app.integrations i
     where i.id = app.ctx_integration_id()
       and i.status = 'active'
       and (i.client_scope = 'all'
            or exists (select 1 from app.integration_clients ic
                        where ic.integration_id = i.id and ic.client_id = p_client_id)))
$$;

grant execute on all functions in schema app to fabsoft_app;

-- -----------------------------------------------------------------------------
-- 3. Activar y FORZAR RLS en todas las tablas (también aplica al propietario)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'app'
  loop
    execute format('alter table app.%I enable row level security', t);
    execute format('alter table app.%I force row level security', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Políticas por tabla. Todas TO fabsoft_app. Sin política => denegado.
-- -----------------------------------------------------------------------------

-- users -----------------------------------------------------------------------
create policy users_select on app.users for select to fabsoft_app
  using (app.is_staff() or app.is_system() or id = app.ctx_user_id());
create policy users_insert on app.users for insert to fabsoft_app
  with check (app.is_admin());
create policy users_update on app.users for update to fabsoft_app
  using (app.is_admin() or app.is_system() or id = app.ctx_user_id())
  with check (app.is_admin() or app.is_system() or id = app.ctx_user_id());

-- Un usuario no-admin no puede alterar columnas privilegiadas de su propia fila.
create or replace function app.tg_users_guard_privileged() returns trigger
language plpgsql as $$
begin
  if not (app.is_admin() or app.is_system()) and (
       new.role is distinct from old.role or new.status is distinct from old.status
       or new.client_id is distinct from old.client_id or new.email is distinct from old.email) then
    raise exception 'Sólo un administrador puede cambiar rol, estado, cliente o correo' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger users_guard_privileged before update on app.users
  for each row execute function app.tg_users_guard_privileged();

-- refresh_tokens (sólo el servicio de autenticación, contexto system) --------------
create policy refresh_tokens_all on app.refresh_tokens for all to fabsoft_app
  using (app.is_system()) with check (app.is_system());

-- clients ---------------------------------------------------------------------
create policy clients_select on app.clients for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or (app.is_client_user() and id = app.ctx_client_id())
         or app.integration_sees_client(id));
create policy clients_insert on app.clients for insert to fabsoft_app
  with check (app.is_staff() and status <> 'archived');
create policy clients_update on app.clients for update to fabsoft_app
  using (app.is_admin() or (app.is_operator() and status <> 'archived'))
  with check (app.is_admin() or (app.is_operator() and status <> 'archived'));   -- archivar: sólo admin

-- client_contacts ---------------------------------------------------------------
create policy client_contacts_select on app.client_contacts for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or (app.is_client_user() and client_id = app.ctx_client_id())
         or app.integration_sees_client(client_id));
create policy client_contacts_insert on app.client_contacts for insert to fabsoft_app
  with check (app.is_staff());
create policy client_contacts_update on app.client_contacts for update to fabsoft_app
  using (app.is_staff()) with check (app.is_staff());

-- client_notes (internas) -------------------------------------------------------
create policy client_notes_select on app.client_notes for select to fabsoft_app
  using (app.is_staff());
create policy client_notes_insert on app.client_notes for insert to fabsoft_app
  with check (app.is_staff() and author_user_id = app.ctx_user_id());

-- products ----------------------------------------------------------------------
create policy products_select on app.products for select to fabsoft_app
  using (app.is_staff() or app.is_system() or app.is_integration()
         or (app.is_client_user() and exists (
               select 1 from app.subscriptions s
                where s.product_id = products.id and s.client_id = app.ctx_client_id() and s.visible_in_portal)));
create policy products_insert on app.products for insert to fabsoft_app
  with check (app.is_admin());
create policy products_update on app.products for update to fabsoft_app
  using (app.is_admin()) with check (app.is_admin());

-- subscriptions -----------------------------------------------------------------
create policy subscriptions_select on app.subscriptions for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or (app.is_client_user() and client_id = app.ctx_client_id() and visible_in_portal)
         or app.integration_sees_client(client_id));
create policy subscriptions_insert on app.subscriptions for insert to fabsoft_app
  with check (app.is_staff() and status in ('pending_activation', 'active'));
create policy subscriptions_update on app.subscriptions for update to fabsoft_app
  using (app.is_admin() or app.is_system() or (app.is_operator() and status <> 'cancelled'))
  with check (app.is_admin() or app.is_system() or (app.is_operator() and status <> 'cancelled'));  -- cancelar: sólo admin

-- subscription_periods ----------------------------------------------------------
create policy subscription_periods_select on app.subscription_periods for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or exists (select 1 from app.subscriptions s
                     where s.id = subscription_periods.subscription_id
                       and ((app.is_client_user() and s.client_id = app.ctx_client_id() and s.visible_in_portal)
                            or app.integration_sees_client(s.client_id))));
create policy subscription_periods_insert on app.subscription_periods for insert to fabsoft_app
  with check (app.is_staff());
create policy subscription_periods_update on app.subscription_periods for update to fabsoft_app
  using (app.is_staff()) with check (app.is_staff());

-- renewal_requests --------------------------------------------------------------
create policy renewal_requests_select on app.renewal_requests for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or (app.is_client_user() and client_id = app.ctx_client_id())
         or app.integration_sees_client(client_id));
create policy renewal_requests_insert on app.renewal_requests for insert to fabsoft_app
  with check (
    status = 'pending_review' and (
      (app.is_staff() and requested_by_user_id = app.ctx_user_id())
      or (app.is_client_user() and client_id = app.ctx_client_id() and requested_by_user_id = app.ctx_user_id())
      or (app.integration_sees_client(client_id) and requested_by_integration_id = app.ctx_integration_id())));
create policy renewal_requests_update on app.renewal_requests for update to fabsoft_app
  using (app.is_staff() or app.is_system()) with check (app.is_staff() or app.is_system());

-- tasks -------------------------------------------------------------------------
create policy tasks_select on app.tasks for select to fabsoft_app
  using (app.is_staff() or app.is_system() or app.integration_sees_client(client_id));
create policy tasks_insert on app.tasks for insert to fabsoft_app
  with check (app.is_staff() or app.is_system());
create policy tasks_update on app.tasks for update to fabsoft_app
  using (app.is_staff() or app.is_system()) with check (app.is_staff() or app.is_system());

-- notifications -----------------------------------------------------------------
create policy notifications_select on app.notifications for select to fabsoft_app
  using (app.is_staff() or app.is_system());
create policy notifications_insert on app.notifications for insert to fabsoft_app
  with check (app.is_staff() or app.is_system());
create policy notifications_update on app.notifications for update to fabsoft_app
  using (app.is_staff() or app.is_system()) with check (app.is_staff() or app.is_system());

-- alert_rules -------------------------------------------------------------------
create policy alert_rules_select on app.alert_rules for select to fabsoft_app
  using (app.is_staff() or app.is_system());
create policy alert_rules_insert on app.alert_rules for insert to fabsoft_app
  with check (app.is_admin());
create policy alert_rules_update on app.alert_rules for update to fabsoft_app
  using (app.is_admin()) with check (app.is_admin());

-- app_settings ------------------------------------------------------------------
create policy app_settings_select on app.app_settings for select to fabsoft_app
  using (app.is_staff() or app.is_system() or (app.is_client_user() and key = 'contact_channel'));
create policy app_settings_insert on app.app_settings for insert to fabsoft_app
  with check (app.is_admin());
create policy app_settings_update on app.app_settings for update to fabsoft_app
  using (app.is_admin()) with check (app.is_admin());

-- integrations ------------------------------------------------------------------
create policy integrations_select on app.integrations for select to fabsoft_app
  using (app.is_admin() or app.is_system() or (app.is_integration() and id = app.ctx_integration_id()));
create policy integrations_insert on app.integrations for insert to fabsoft_app
  with check (app.is_admin());
create policy integrations_update on app.integrations for update to fabsoft_app
  using (app.is_admin() or app.is_system()) with check (app.is_admin() or app.is_system());

-- integration_clients -----------------------------------------------------------
create policy integration_clients_select on app.integration_clients for select to fabsoft_app
  using (app.is_admin() or app.is_system() or (app.is_integration() and integration_id = app.ctx_integration_id()));
create policy integration_clients_insert on app.integration_clients for insert to fabsoft_app
  with check (app.is_admin());
create policy integration_clients_delete on app.integration_clients for delete to fabsoft_app
  using (app.is_admin());

-- api_credentials (búsqueda por prefijo en contexto system) -----------------------
create policy api_credentials_select on app.api_credentials for select to fabsoft_app
  using (app.is_admin() or app.is_system());
create policy api_credentials_insert on app.api_credentials for insert to fabsoft_app
  with check (app.is_admin());
create policy api_credentials_update on app.api_credentials for update to fabsoft_app
  using (app.is_admin() or app.is_system()) with check (app.is_admin() or app.is_system());

-- idempotency_keys --------------------------------------------------------------
create policy idempotency_keys_rw on app.idempotency_keys for all to fabsoft_app
  using ((actor_type = 'user' and actor_id = app.ctx_user_id())
         or (actor_type = 'integration' and actor_id = app.ctx_integration_id())
         or app.is_system())
  with check ((actor_type = 'user' and actor_id = app.ctx_user_id())
              or (actor_type = 'integration' and actor_id = app.ctx_integration_id()));

-- audit_logs (append-only; el actor registrado debe coincidir con el contexto) ----
create policy audit_logs_select on app.audit_logs for select to fabsoft_app
  using (app.is_admin() or app.is_system()
         or (app.is_operator() and resource_type in ('client', 'client_contact', 'client_note', 'product',
                                                     'subscription', 'subscription_period', 'renewal_request', 'task')));
create policy audit_logs_insert on app.audit_logs for insert to fabsoft_app
  with check ((actor_type = 'user' and actor_user_id = app.ctx_user_id())
              or (actor_type = 'integration' and actor_integration_id = app.ctx_integration_id())
              or (actor_type = 'system' and app.is_system()));

-- migrate:down
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'app'
  loop
    execute format('drop policy if exists %I on app.%I', r.policyname, r.tablename);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'app'
  loop
    execute format('alter table app.%I no force row level security', r.tablename);
    execute format('alter table app.%I disable row level security', r.tablename);
  end loop;
end $$;
drop trigger if exists users_guard_privileged on app.users;
drop function if exists app.tg_users_guard_privileged();
drop function if exists app.integration_sees_client(uuid);
drop function if exists app.is_integration();
drop function if exists app.is_client_user();
drop function if exists app.is_system();
drop function if exists app.is_staff();
drop function if exists app.is_operator();
drop function if exists app.is_admin();
drop function if exists app.ctx_integration_id();
drop function if exists app.ctx_client_id();
drop function if exists app.ctx_user_id();
drop function if exists app.ctx_role();
drop function if exists app.ctx_actor_type();
revoke all on all tables in schema app from fabsoft_app;
revoke all on schema app from fabsoft_app;
