-- migrate:up
-- =============================================================================
-- FabSoft · 0003_security_hardening.sql
-- Endurecimiento posterior a la revisión de seguridad (HT-03). No modifica 0001/0002.
--   H1  Privilegios por defecto + verificación/forzado de RLS en tablas nuevas.
--   M1  Rol fabsoft_worker separado; pg-boss confinado al esquema pgboss;
--       fabsoft_app pierde CREATE ON DATABASE.
--   M2  idempotency_keys: políticas por comando; DELETE sólo contexto system.
--   M3  El rol lógico `client` ya no lee la tabla base subscriptions/subscription_periods:
--       lee vistas security_barrier sin columnas internas. password_hash deja de
--       ser legible por fabsoft_app (privilegios por columna + función acotada).
--   M6  client_contacts: el rol client no tiene acceso (matriz de permisos).
--   M7  Trigger: sólo admin/system cambian price_amount / supplier_cost_amount.
--
-- CONTRATO PARA LA CAPA REPOSITORY (ver docs/security/threat-model.md §3 y §6):
--   * Portal (rol client): leer SIEMPRE app.portal_subscriptions y
--     app.portal_subscription_periods; las tablas base devuelven 0 filas al cliente.
--   * app.users: prohibido `select *` / `returning *` (falla con 42501). Listar columnas.
--     El hash se obtiene con app.auth_password_hash(user_id), que sólo responde en
--     contexto system (login) o para el propio usuario (cambio de contraseña).
--   * Operador: actualizar price_amount/supplier_cost_amount lanza 42501 (traducir a 403).
-- Requisito dbmate: usar --migrations-table public.schema_migrations (0001-0003 fijan
-- search_path=app dentro de la transacción).
-- =============================================================================
set local search_path = app, pg_catalog;

-- -----------------------------------------------------------------------------
-- H1. Privilegios por defecto para objetos que cree el rol migrador en `app`
-- -----------------------------------------------------------------------------
alter default privileges in schema app grant select, insert, update on tables to fabsoft_app;
alter default privileges in schema app grant usage, select on sequences to fabsoft_app;
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema app grant execute on functions to fabsoft_app;

-- Inventario consultable por CI y por la suite de seguridad.
create or replace function app.rls_inventory()
returns table (table_name text, rls_enabled boolean, rls_forced boolean, policy_count integer)
language sql stable as $$
  select c.relname::text, c.relrowsecurity, c.relforcerowsecurity,
         (select count(*)::int from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app' and c.relkind in ('r', 'p')
   order by 1 $$;

-- Falla si alguna tabla de `app` no tiene RLS habilitado Y forzado. Llamar al final de cada migración/CI.
create or replace function app.assert_rls_everywhere() returns void
language plpgsql stable as $$
declare bad text;
begin
  select string_agg(table_name, ', ') into bad from app.rls_inventory() where not (rls_enabled and rls_forced);
  if bad is not null then
    raise exception 'Tablas de app sin RLS habilitado+forzado: %', bad using errcode = '42501';
  end if;
end $$;

-- Event trigger: toda tabla nueva en `app` nace con ENABLE + FORCE RLS (sin políticas ⇒ denegado).
create or replace function app.tg_enforce_rls_on_create() returns event_trigger
language plpgsql as $$
declare r record;
begin
  for r in select * from pg_event_trigger_ddl_commands()
            where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
              and object_type = 'table' and schema_name = 'app'
  loop
    execute format('alter table %s enable row level security', r.object_identity);
    execute format('alter table %s force row level security', r.object_identity);
  end loop;
end $$;
revoke execute on function app.tg_enforce_rls_on_create() from fabsoft_app;

-- Crear event triggers requiere superusuario (VPS/local). En Supabase puede no estar
-- permitido: entonces queda como red de seguridad app.assert_rls_everywhere() en CI.
do $$
begin
  if (select rolsuper from pg_roles where rolname = current_user) then
    execute 'drop event trigger if exists fabsoft_enforce_rls';
    execute 'create event trigger fabsoft_enforce_rls on ddl_command_end
               when tag in (''CREATE TABLE'', ''CREATE TABLE AS'', ''SELECT INTO'')
               execute function app.tg_enforce_rls_on_create()';
  else
    raise notice 'Sin superusuario: event trigger fabsoft_enforce_rls NO creado; usar app.assert_rls_everywhere() en CI';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- M1. Rol del worker y confinamiento de pg-boss
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fabsoft_worker') then
    create role fabsoft_worker nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls;
  end if;
end $$;
-- Hereda permisos y políticas RLS (TO fabsoft_app) de la app; opera en contexto system.
grant fabsoft_app to fabsoft_worker;

create schema if not exists pgboss authorization fabsoft_worker;
alter schema pgboss owner to fabsoft_worker;
revoke all on schema pgboss from public;
-- La API encola trabajos (ADR-005): acceso DML a pgboss, sin CREATE.
grant usage on schema pgboss to fabsoft_app;
grant select, insert, update, delete on all tables in schema pgboss to fabsoft_app;
grant usage, select on all sequences in schema pgboss to fabsoft_app;
alter default privileges for role fabsoft_worker in schema pgboss
  grant select, insert, update, delete on tables to fabsoft_app;
alter default privileges for role fabsoft_worker in schema pgboss
  grant usage, select on sequences to fabsoft_app;
alter default privileges for role fabsoft_worker in schema pgboss
  grant execute on functions to fabsoft_app;

do $$
begin
  execute format('revoke create on database %I from fabsoft_app', current_database());
  execute format('revoke create on database %I from fabsoft_worker', current_database());
end $$;
revoke create on schema app from fabsoft_app;

-- -----------------------------------------------------------------------------
-- M2. idempotency_keys por comando
-- -----------------------------------------------------------------------------
drop policy if exists idempotency_keys_rw on app.idempotency_keys;
create policy idempotency_keys_select on app.idempotency_keys for select to fabsoft_app
  using ((actor_type = 'user' and actor_id = app.ctx_user_id())
         or (actor_type = 'integration' and actor_id = app.ctx_integration_id())
         or app.is_system());
create policy idempotency_keys_insert on app.idempotency_keys for insert to fabsoft_app
  with check ((actor_type = 'user' and actor_id = app.ctx_user_id())
              or (actor_type = 'integration' and actor_id = app.ctx_integration_id()));
create policy idempotency_keys_update on app.idempotency_keys for update to fabsoft_app
  using ((actor_type = 'user' and actor_id = app.ctx_user_id())
         or (actor_type = 'integration' and actor_id = app.ctx_integration_id()))
  with check ((actor_type = 'user' and actor_id = app.ctx_user_id())
              or (actor_type = 'integration' and actor_id = app.ctx_integration_id()));
create policy idempotency_keys_delete on app.idempotency_keys for delete to fabsoft_app
  using (app.is_system());

-- -----------------------------------------------------------------------------
-- M7. Precio y costo de proveedor: sólo admin (o system)
-- -----------------------------------------------------------------------------
create or replace function app.tg_subscriptions_guard_pricing() returns trigger
language plpgsql as $$
begin
  if app.is_admin() or app.is_system() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.supplier_cost_amount is not null then
    raise exception 'Sólo un administrador puede fijar el costo de proveedor' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.price_amount is distinct from old.price_amount
                           or new.supplier_cost_amount is distinct from old.supplier_cost_amount) then
    raise exception 'Sólo un administrador puede cambiar precio o costo de proveedor' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger subscriptions_guard_pricing before insert or update on app.subscriptions
  for each row execute function app.tg_subscriptions_guard_pricing();

-- -----------------------------------------------------------------------------
-- M6. client_contacts: sin acceso para el rol client
-- -----------------------------------------------------------------------------
drop policy client_contacts_select on app.client_contacts;
create policy client_contacts_select on app.client_contacts for select to fabsoft_app
  using (app.is_staff() or app.is_system() or app.integration_sees_client(client_id));

-- -----------------------------------------------------------------------------
-- M3. Columnas sensibles fuera del alcance del rol client
--   Técnica: todos los roles lógicos comparten fabsoft_app, así que los GRANT por
--   columna no distinguen staff de client. Se usa un rol propietario dedicado
--   (fabsoft_secure_view, NOLOGIN, sin BYPASSRLS) que posee vistas security_barrier
--   y funciones SECURITY DEFINER; tiene sus propias políticas RLS (TO fabsoft_secure_view)
--   y SELECT sólo sobre las columnas permitidas. El cliente pierde la rama de la tabla base.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fabsoft_secure_view') then
    create role fabsoft_secure_view nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
grant usage on schema app to fabsoft_secure_view;
grant execute on function app.ctx_actor_type(), app.ctx_role(), app.ctx_user_id(), app.ctx_client_id(),
  app.is_client_user(), app.is_system() to fabsoft_secure_view;

grant select (id, client_id, product_id, contract_reference, start_date, current_period_end, billing_cycle,
              custom_cycle_months, price_amount, currency, renewal_terms, is_renewable, status,
              visible_in_portal, created_at, updated_at)
  on app.subscriptions to fabsoft_secure_view;
grant select (id, subscription_id, period_number, start_date, end_date, billing_cycle, custom_cycle_months,
              price_amount, currency, renewal_outcome, contract_reference, created_at)
  on app.subscription_periods to fabsoft_secure_view;
grant select (id, password_hash) on app.users to fabsoft_secure_view;

create policy subscriptions_select_secure_view on app.subscriptions for select to fabsoft_secure_view
  using (app.is_client_user() and client_id = app.ctx_client_id() and visible_in_portal);
create policy subscription_periods_select_secure_view on app.subscription_periods for select to fabsoft_secure_view
  using (exists (select 1 from app.subscriptions s where s.id = subscription_periods.subscription_id));
create policy users_select_secure_view on app.users for select to fabsoft_secure_view
  using (app.is_system() or id = app.ctx_user_id());

-- Tablas base: sin rama client.
drop policy subscriptions_select on app.subscriptions;
create policy subscriptions_select on app.subscriptions for select to fabsoft_app
  using (app.is_staff() or app.is_system() or app.integration_sees_client(client_id));
drop policy subscription_periods_select on app.subscription_periods;
create policy subscription_periods_select on app.subscription_periods for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or exists (select 1 from app.subscriptions s
                     where s.id = subscription_periods.subscription_id
                       and app.integration_sees_client(s.client_id)));

-- Vistas del portal (sin supplier_cost_amount, notes, owner_user_id, follow_up_status, payment_status).
create view app.portal_subscriptions with (security_barrier = true) as
  select id, client_id, product_id, contract_reference, start_date, current_period_end, billing_cycle,
         custom_cycle_months, price_amount, currency, renewal_terms, is_renewable, status, created_at, updated_at
    from app.subscriptions
   where app.is_client_user() and client_id = app.ctx_client_id() and visible_in_portal;
create view app.portal_subscription_periods with (security_barrier = true) as
  select p.id, p.subscription_id, p.period_number, p.start_date, p.end_date, p.billing_cycle,
         p.custom_cycle_months, p.price_amount, p.currency, p.renewal_outcome, p.contract_reference, p.created_at
    from app.subscription_periods p
    join app.subscriptions s on s.id = p.subscription_id
   where app.is_client_user() and s.client_id = app.ctx_client_id() and s.visible_in_portal;
alter view app.portal_subscriptions owner to fabsoft_secure_view;
alter view app.portal_subscription_periods owner to fabsoft_secure_view;
revoke all on app.portal_subscriptions, app.portal_subscription_periods from public;
grant select on app.portal_subscriptions, app.portal_subscription_periods to fabsoft_app;

-- products: la rama client necesitaba leer subscriptions base; se sustituye por función acotada.
create or replace function app.client_has_visible_product(p_product_id uuid) returns boolean
language sql stable security definer set search_path = app, pg_catalog as $$
  select app.is_client_user() and exists (
    select 1 from app.subscriptions s
     where s.product_id = p_product_id and s.client_id = app.ctx_client_id() and s.visible_in_portal) $$;
grant select (product_id) on app.subscriptions to fabsoft_secure_view;
alter function app.client_has_visible_product(uuid) owner to fabsoft_secure_view;
revoke execute on function app.client_has_visible_product(uuid) from public;
grant execute on function app.client_has_visible_product(uuid) to fabsoft_app;
drop policy products_select on app.products;
create policy products_select on app.products for select to fabsoft_app
  using (app.is_staff() or app.is_system() or app.is_integration() or app.client_has_visible_product(id));

-- users.password_hash: ilegible para fabsoft_app (y fabsoft_worker por herencia).
revoke select on app.users from fabsoft_app;
grant select (id, email, full_name, role, client_id, status, must_change_password, last_login_at,
              password_changed_at, created_at, updated_at, created_by, updated_by)
  on app.users to fabsoft_app;
create or replace function app.auth_password_hash(p_user_id uuid) returns text
language sql stable security definer set search_path = app, pg_catalog as $$
  select u.password_hash from app.users u
   where u.id = p_user_id and (app.is_system() or p_user_id = app.ctx_user_id()) $$;
alter function app.auth_password_hash(uuid) owner to fabsoft_secure_view;
revoke execute on function app.auth_password_hash(uuid) from public;
grant execute on function app.auth_password_hash(uuid) to fabsoft_app;

select app.assert_rls_everywhere();

-- migrate:down
-- Revierte 0003 al estado exacto de 0002. NUNCA desactiva RLS ni FORCE.
set local search_path = app, pg_catalog;

-- M3
drop policy if exists products_select on app.products;
create policy products_select on app.products for select to fabsoft_app
  using (app.is_staff() or app.is_system() or app.is_integration()
         or (app.is_client_user() and exists (
               select 1 from app.subscriptions s
                where s.product_id = products.id and s.client_id = app.ctx_client_id() and s.visible_in_portal)));
drop function if exists app.client_has_visible_product(uuid);
drop function if exists app.auth_password_hash(uuid);
drop view if exists app.portal_subscription_periods;
drop view if exists app.portal_subscriptions;
drop policy if exists subscriptions_select on app.subscriptions;
create policy subscriptions_select on app.subscriptions for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or (app.is_client_user() and client_id = app.ctx_client_id() and visible_in_portal)
         or app.integration_sees_client(client_id));
drop policy if exists subscription_periods_select on app.subscription_periods;
create policy subscription_periods_select on app.subscription_periods for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or exists (select 1 from app.subscriptions s
                     where s.id = subscription_periods.subscription_id
                       and ((app.is_client_user() and s.client_id = app.ctx_client_id() and s.visible_in_portal)
                            or app.integration_sees_client(s.client_id))));
drop policy if exists subscriptions_select_secure_view on app.subscriptions;
drop policy if exists subscription_periods_select_secure_view on app.subscription_periods;
drop policy if exists users_select_secure_view on app.users;
grant select on app.users to fabsoft_app;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'fabsoft_secure_view') then
    execute 'reassign owned by fabsoft_secure_view to ' || quote_ident(current_user);
    execute 'drop owned by fabsoft_secure_view';
    -- El rol es global al clúster (puede tener privilegios en otras BD): no se elimina, como fabsoft_app en 0002.
  end if;
end $$;

-- M6
drop policy if exists client_contacts_select on app.client_contacts;
create policy client_contacts_select on app.client_contacts for select to fabsoft_app
  using (app.is_staff() or app.is_system()
         or (app.is_client_user() and client_id = app.ctx_client_id())
         or app.integration_sees_client(client_id));

-- M7
drop trigger if exists subscriptions_guard_pricing on app.subscriptions;
drop function if exists app.tg_subscriptions_guard_pricing();

-- M2
drop policy if exists idempotency_keys_select on app.idempotency_keys;
drop policy if exists idempotency_keys_insert on app.idempotency_keys;
drop policy if exists idempotency_keys_update on app.idempotency_keys;
drop policy if exists idempotency_keys_delete on app.idempotency_keys;
create policy idempotency_keys_rw on app.idempotency_keys for all to fabsoft_app
  using ((actor_type = 'user' and actor_id = app.ctx_user_id())
         or (actor_type = 'integration' and actor_id = app.ctx_integration_id())
         or app.is_system())
  with check ((actor_type = 'user' and actor_id = app.ctx_user_id())
              or (actor_type = 'integration' and actor_id = app.ctx_integration_id()));

-- M1 (el esquema pgboss y sus datos se conservan; pasan al rol migrador)
do $$
begin
  execute format('grant create on database %I to fabsoft_app', current_database());
  if exists (select 1 from pg_roles where rolname = 'fabsoft_worker') then
    execute 'alter default privileges for role fabsoft_worker in schema pgboss revoke all on tables from fabsoft_app';
    execute 'alter default privileges for role fabsoft_worker in schema pgboss revoke all on sequences from fabsoft_app';
    execute 'alter default privileges for role fabsoft_worker in schema pgboss revoke all on functions from fabsoft_app';
    execute 'reassign owned by fabsoft_worker to ' || quote_ident(current_user);
    execute 'drop owned by fabsoft_worker';
    -- Rol global al clúster: se conserva sin privilegios en esta BD.
  end if;
end $$;

-- H1
drop event trigger if exists fabsoft_enforce_rls;
drop function if exists app.tg_enforce_rls_on_create();
drop function if exists app.assert_rls_everywhere();
drop function if exists app.rls_inventory();
alter default privileges in schema app revoke select, insert, update on tables from fabsoft_app;
alter default privileges in schema app revoke usage, select on sequences from fabsoft_app;
alter default privileges in schema app revoke execute on functions from fabsoft_app;
alter default privileges in schema app grant execute on functions to public;
