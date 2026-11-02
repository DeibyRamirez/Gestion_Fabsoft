-- migrate:up
-- =============================================================================
-- FabSoft · 0005_auth_security_definer.sql
-- 1) app.bootstrap_first_admin(): alta del primer admin sin rol propietario/BYPASSRLS.
-- 2) app.revoke_user_sessions(): revocación de refresh tokens en la MISMA transacción del
--    cambio (contraseña, desactivación, cambio de rol, reseteo), sin contexto system.
--
-- Por qué funciones SECURITY DEFINER y no una política UPDATE en refresh_tokens:
--   * UPDATE ... WHERE user_id = $1 exige también una política SELECT ⇒ el usuario podría
--     leer token_hash/ip/user_agent de sus sesiones.
--   * WITH CHECK no ve la fila anterior: no puede impedir "des-revocar" (revoked_at = null)
--     ni cambiar expires_at; los GRANT por columna no distinguen contextos (todo es fabsoft_app).
--   * La función sólo puede poner revoked_at/revoked_reason en filas activas, valida el
--     motivo y el actor, y no devuelve datos de los tokens.
--
-- Propietario: rol NOLOGIN dedicado fabsoft_auth_definer (sin BYPASSRLS), con privilegios
-- por columna y políticas propias; sólo se usa a través de estas funciones.
-- =============================================================================
set local search_path = app, pg_catalog;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fabsoft_auth_definer') then
    create role fabsoft_auth_definer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  -- Rol para quien ejecuta el bootstrap (script create-admin). NOLOGIN: operaciones lo
  -- concede temporalmente al operador/CI o le da LOGIN puntual (docs/deployment.md §6).
  if not exists (select 1 from pg_roles where rolname = 'fabsoft_bootstrap') then
    create role fabsoft_bootstrap nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls;
  end if;
end $$;

grant usage on schema app to fabsoft_auth_definer;
grant usage on schema app to fabsoft_bootstrap;
grant usage on type app.user_role, app.user_status, app.actor_type to fabsoft_auth_definer;
grant execute on function app.ctx_actor_type(), app.ctx_role(), app.ctx_user_id(), app.is_admin(),
  app.is_system() to fabsoft_auth_definer;

-- users: comprobar si existe admin, comprobar email, insertar el primero.
grant select (id, email, role, status) on app.users to fabsoft_auth_definer;
grant insert (email, full_name, password_hash, role, must_change_password) on app.users to fabsoft_auth_definer;
create policy users_select_auth_definer on app.users for select to fabsoft_auth_definer using (true);
create policy users_insert_auth_definer on app.users for insert to fabsoft_auth_definer
  with check (role = 'admin' and client_id is null and must_change_password);

-- refresh_tokens: sólo marcar revocación de filas activas del usuario permitido.
grant select (id, user_id, family_id, token_hash, revoked_at) on app.refresh_tokens to fabsoft_auth_definer;
grant update (revoked_at, revoked_reason) on app.refresh_tokens to fabsoft_auth_definer;
create policy refresh_tokens_select_auth_definer on app.refresh_tokens for select to fabsoft_auth_definer
  using (app.is_system() or app.is_admin() or user_id = app.ctx_user_id());
create policy refresh_tokens_update_auth_definer on app.refresh_tokens for update to fabsoft_auth_definer
  using (app.is_system() or app.is_admin() or user_id = app.ctx_user_id())
  with check (revoked_at is not null);

-- audit_logs: sólo eventos system de estas funciones.
grant insert (actor_type, action, resource_type, resource_id, changes, request_id) on app.audit_logs to fabsoft_auth_definer;
create policy audit_logs_insert_auth_definer on app.audit_logs for insert to fabsoft_auth_definer
  with check (actor_type = 'system' and action in ('user.bootstrap_admin', 'auth.sessions_revoked'));

-- -----------------------------------------------------------------------------
-- 1. Bootstrap del primer admin
-- -----------------------------------------------------------------------------
create or replace function app.bootstrap_first_admin(p_email text, p_full_name text, p_password_hash text)
returns uuid
language plpgsql volatile security definer set search_path = app, pg_catalog as $$
declare v_id uuid;
begin
  if p_password_hash is null or p_password_hash not like '$argon2id$%' then
    raise exception 'password_hash debe ser argon2id (formato PHC)' using errcode = '22023';
  end if;
  -- Serializa bootstraps concurrentes.
  perform pg_advisory_xact_lock(hashtext('fabsoft.bootstrap_first_admin'));
  if exists (select 1 from app.users where role = 'admin') then
    raise exception 'Ya existe un administrador; bootstrap deshabilitado' using errcode = '42501';
  end if;
  insert into app.users (email, full_name, password_hash, role, must_change_password)
  values (lower(btrim(p_email)), p_full_name, p_password_hash, 'admin', true)
  returning id into v_id;
  insert into app.audit_logs (actor_type, action, resource_type, resource_id, changes, request_id)
  values ('system', 'user.bootstrap_admin', 'user', v_id::text,
          jsonb_build_object('after', jsonb_build_object('email', lower(btrim(p_email)), 'role', 'admin')),
          nullif(current_setting('app.request_id', true), ''));
  return v_id;
end $$;
alter function app.bootstrap_first_admin(text, text, text) owner to fabsoft_auth_definer;
revoke execute on function app.bootstrap_first_admin(text, text, text) from public, fabsoft_app;
grant execute on function app.bootstrap_first_admin(text, text, text) to fabsoft_bootstrap;

-- -----------------------------------------------------------------------------
-- 2. Revocación atómica de sesiones
--   Autorizado si: admin, system, o el propio usuario (p_user_id = app.current_user_id).
--   p_except_token_hash: conserva la familia de la sesión actual (cambio de contraseña propio).
--   Devuelve el número de tokens revocados.
-- -----------------------------------------------------------------------------
create or replace function app.revoke_user_sessions(p_user_id uuid, p_reason text, p_except_token_hash text default null)
returns integer
language plpgsql volatile security definer set search_path = app, pg_catalog as $$
declare v_count integer;
begin
  if p_reason not in ('user_disabled', 'password_changed', 'admin', 'logout') then
    raise exception 'Motivo de revocación no permitido: %', p_reason using errcode = '22023';
  end if;
  if not (app.is_admin() or app.is_system()
          or (app.ctx_actor_type() = 'user' and p_user_id = app.ctx_user_id())) then
    raise exception 'No autorizado para revocar sesiones de otro usuario' using errcode = '42501';
  end if;
  update app.refresh_tokens t
     set revoked_at = now(), revoked_reason = p_reason
   where t.user_id = p_user_id and t.revoked_at is null
     and (p_except_token_hash is null or t.family_id is distinct from (
           select x.family_id from app.refresh_tokens x
            where x.token_hash = p_except_token_hash and x.user_id = p_user_id));
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into app.audit_logs (actor_type, action, resource_type, resource_id, changes, request_id)
    values ('system', 'auth.sessions_revoked', 'user', p_user_id::text,
            jsonb_build_object('reason', p_reason, 'count', v_count,
                               'by', coalesce(app.ctx_user_id()::text, app.ctx_actor_type())),
            nullif(current_setting('app.request_id', true), ''));
  end if;
  return v_count;
end $$;
alter function app.revoke_user_sessions(uuid, text, text) owner to fabsoft_auth_definer;
revoke execute on function app.revoke_user_sessions(uuid, text, text) from public;
grant execute on function app.revoke_user_sessions(uuid, text, text) to fabsoft_app;

select app.assert_rls_everywhere();

-- migrate:down
-- Vuelve al estado de 0004. No desactiva RLS. Los roles (globales al clúster) se conservan sin privilegios aquí.
set local search_path = app, pg_catalog;
drop function if exists app.revoke_user_sessions(uuid, text, text);
drop function if exists app.bootstrap_first_admin(text, text, text);
drop policy if exists audit_logs_insert_auth_definer on app.audit_logs;
drop policy if exists refresh_tokens_update_auth_definer on app.refresh_tokens;
drop policy if exists refresh_tokens_select_auth_definer on app.refresh_tokens;
drop policy if exists users_insert_auth_definer on app.users;
drop policy if exists users_select_auth_definer on app.users;
do $$
declare r text;
begin
  foreach r in array array['fabsoft_auth_definer', 'fabsoft_bootstrap'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('reassign owned by %I to %I', r, current_user);
      execute format('drop owned by %I', r);
    end if;
  end loop;
end $$;
