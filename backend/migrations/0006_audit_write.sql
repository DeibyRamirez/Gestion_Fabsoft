-- migrate:up
-- =============================================================================
-- FabSoft · 0006_audit_write.sql
-- Escritura de auditoría vía app.audit_write() (SECURITY DEFINER, dueño dedicado).
--
-- Contrato:
--   * fabsoft_app ya NO tiene INSERT directo en audit_logs (sólo SELECT + audit_write).
--   * Actor, rol y request_id salen de GUCs app.* fijadas por el backend (SET LOCAL); los
--     parámetros de la función NO autentican identidad frente a SQL arbitrario con SET.
--   * Cambios allowlisted y redactados en la función; supplier_cost_amount sólo visible en
--     contexto admin (no en auditoría “activity” de operador/cliente).
--   * Sin clave "before" en acciones *.created.
--   * Idempotencia: mismo request_id + action + resource ⇒ misma fila (replay).
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fabsoft_audit_definer') then
    create role fabsoft_audit_definer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

grant usage on schema app to fabsoft_audit_definer;
grant usage on type app.actor_type to fabsoft_audit_definer;
grant execute on function app.ctx_actor_type(), app.ctx_role(), app.ctx_user_id(), app.ctx_integration_id(),
  app.ctx_client_id(), app.is_admin(), app.is_operator(), app.is_system(), app.is_client_user()
  to fabsoft_audit_definer;

grant insert on app.audit_logs to fabsoft_audit_definer;
grant select (id) on app.clients to fabsoft_audit_definer;
grant select (id, client_id) on app.client_contacts to fabsoft_audit_definer;
grant select (id, client_id) on app.client_notes to fabsoft_audit_definer;
grant select (id) on app.products to fabsoft_audit_definer;
grant select (id, client_id) on app.subscriptions to fabsoft_audit_definer;
grant select (id, subscription_id) on app.subscription_periods to fabsoft_audit_definer;
grant select (id, client_id) on app.renewal_requests to fabsoft_audit_definer;
grant select (id, client_id) on app.tasks to fabsoft_audit_definer;
grant select (id) on app.notifications to fabsoft_audit_definer;
grant select (id) on app.alert_rules to fabsoft_audit_definer;
grant select (id) on app.integrations to fabsoft_audit_definer;
grant select (id, client_id) on app.users to fabsoft_audit_definer;
grant select (key) on app.app_settings to fabsoft_audit_definer;

create policy audit_logs_select_audit_definer on app.audit_logs for select to fabsoft_audit_definer using (true);
create policy clients_select_audit_definer on app.clients for select to fabsoft_audit_definer using (true);
create policy client_contacts_select_audit_definer on app.client_contacts for select to fabsoft_audit_definer using (true);
create policy client_notes_select_audit_definer on app.client_notes for select to fabsoft_audit_definer using (true);
create policy products_select_audit_definer on app.products for select to fabsoft_audit_definer using (true);
create policy subscriptions_select_audit_definer on app.subscriptions for select to fabsoft_audit_definer using (true);
create policy subscription_periods_select_audit_definer on app.subscription_periods for select to fabsoft_audit_definer using (true);
create policy renewal_requests_select_audit_definer on app.renewal_requests for select to fabsoft_audit_definer using (true);
create policy tasks_select_audit_definer on app.tasks for select to fabsoft_audit_definer using (true);
create policy notifications_select_audit_definer on app.notifications for select to fabsoft_audit_definer using (true);
create policy alert_rules_select_audit_definer on app.alert_rules for select to fabsoft_audit_definer using (true);
create policy integrations_select_audit_definer on app.integrations for select to fabsoft_audit_definer using (true);
create policy users_select_audit_definer on app.users for select to fabsoft_audit_definer using (true);
create policy app_settings_select_audit_definer on app.app_settings for select to fabsoft_audit_definer using (true);

revoke insert on app.audit_logs from fabsoft_app;
drop policy if exists audit_logs_insert on app.audit_logs;

create unique index if not exists audit_logs_idempotent_uq on app.audit_logs (request_id, action, resource_type, resource_id)
  where request_id is not null and btrim(request_id) <> '';

-- Claves sensibles (redacción recursiva).
create or replace function app.audit_is_secret_key(p_key text) returns boolean
language sql immutable parallel safe security definer set search_path = pg_catalog as $$
  select lower(p_key) ~ '^(password|password_hash|passwordhash|apikey|api_key|key_hash|keyhash|token|secret|authorization|connection_string|database_url|.*_token)$'
     or lower(p_key) like '%password%'
     or lower(p_key) like '%secret%';
$$;

create or replace function app.audit_allowlist_keys(p_resource_type text) returns text[]
language sql immutable parallel safe security definer set search_path = pg_catalog as $$
  select case p_resource_type
    when 'user' then array['email','full_name','role','client_id','status','must_change_password']
    when 'client' then array['legal_name','tax_id','status','owner_user_id','archived_at']
    when 'client_contact' then array['full_name','email','phone','role_title','is_primary','status']
    when 'client_note' then array['body']
    when 'product' then array['name','description','product_type','vendor','reference_code','status']
    when 'subscription' then array['product_id','cycle','start_date','end_date','price_amount','supplier_cost_amount','status','visible_in_portal','notes','follow_up_status']
    when 'subscription_period' then array['period_number','start_date','end_date','price_amount','supplier_cost_amount','renewal_outcome','payment_status']
    when 'renewal_request' then array['status','requested_by','notes']
    when 'task' then array['title','status','priority','due_date','assignee_user_id','notes']
    when 'notification' then array['status','channel','notification_type']
    when 'alert_rule' then array['description','offset_days','channels','is_active']
    when 'integration' then array['name','status','scopes']
    when 'api_credential' then array['label','status','expires_at']
    when 'app_setting' then array['value']
    else array[]::text[]
  end;
$$;

create or replace function app.audit_redact_jsonb(p_val jsonb, p_allow text[], p_admin boolean) returns jsonb
language plpgsql immutable security definer set search_path = pg_catalog as $$
declare k text; out jsonb := '{}'::jsonb; v jsonb;
begin
  if p_val is null or jsonb_typeof(p_val) <> 'object' then
  return p_val;
  end if;
  for k, v in select key, value from jsonb_each(p_val) loop
    if app.audit_is_secret_key(k) then
      out := out || jsonb_build_object(k, '[REDACTED]');
    elsif k = 'supplier_cost_amount' and not p_admin then
      continue;
    elsif p_allow is not null and cardinality(p_allow) > 0 and not (k = any (p_allow)) then
      continue;
    elsif jsonb_typeof(v) = 'object' then
      out := out || jsonb_build_object(k, app.audit_redact_jsonb(v, null, p_admin));
    elsif jsonb_typeof(v) = 'array' then
      out := out || jsonb_build_object(k, app.audit_redact_jsonb_array(v, p_allow, p_admin));
    else
      out := out || jsonb_build_object(k, v);
    end if;
  end loop;
  return out;
end $$;

create or replace function app.audit_redact_jsonb_array(p_val jsonb, p_allow text[], p_admin boolean) returns jsonb
language plpgsql immutable security definer set search_path = pg_catalog as $$
declare i jsonb; out jsonb := '[]'::jsonb;
begin
  if p_val is null or jsonb_typeof(p_val) <> 'array' then return p_val; end if;
  for i in select value from jsonb_array_elements(p_val) loop
    if jsonb_typeof(i) in ('object','array') then
      out := out || jsonb_build_array(
        case jsonb_typeof(i)
          when 'object' then app.audit_redact_jsonb(i, p_allow, p_admin)
          else app.audit_redact_jsonb_array(i, p_allow, p_admin)
        end);
    else
      out := out || jsonb_build_array(i);
    end if;
  end loop;
  return out;
end $$;

create or replace function app.audit_prepare_changes(
  p_action text, p_resource_type text, p_changes jsonb, p_admin boolean)
returns jsonb
language plpgsql immutable security definer set search_path = app, pg_catalog as $$
declare ch jsonb; allow text[];
begin
  if p_changes is null then return null; end if;
  allow := app.audit_allowlist_keys(p_resource_type);
  ch := app.audit_redact_jsonb(p_changes, allow, p_admin);
  if p_action ~ '\.created$' and ch ? 'before' then
    ch := ch - 'before';
  end if;
  return ch;
end $$;

create or replace function app.audit_resolve_client_id(p_resource_type text, p_resource_id text)
returns uuid
language plpgsql stable security definer set search_path = app, pg_catalog as $$
declare v uuid;
begin
  case p_resource_type
    when 'client' then return p_resource_id::uuid;
    when 'client_contact' then
      select client_id into v from app.client_contacts where id = p_resource_id::uuid;
    when 'client_note' then
      select client_id into v from app.client_notes where id = p_resource_id::uuid;
    when 'subscription' then
      select client_id into v from app.subscriptions where id = p_resource_id::uuid;
    when 'subscription_period' then
      select s.client_id into v from app.subscription_periods sp
        join app.subscriptions s on s.id = sp.subscription_id where sp.id = p_resource_id::uuid;
    when 'renewal_request' then
      select client_id into v from app.renewal_requests where id = p_resource_id::uuid;
    when 'task' then
      select client_id into v from app.tasks where id = p_resource_id::uuid;
    when 'user' then
      select client_id into v from app.users where id = p_resource_id::uuid;
    else v := null;
  end case;
  return v;
end $$;

create or replace function app.audit_resource_exists(p_resource_type text, p_resource_id text) returns boolean
language plpgsql stable security definer set search_path = app, pg_catalog as $$
begin
  if p_resource_id = 'unknown' then
    return p_resource_type = 'user';
  end if;
  case p_resource_type
    when 'client' then return exists(select 1 from app.clients where id = p_resource_id::uuid);
    when 'client_contact' then return exists(select 1 from app.client_contacts where id = p_resource_id::uuid);
    when 'client_note' then return exists(select 1 from app.client_notes where id = p_resource_id::uuid);
    when 'product' then return exists(select 1 from app.products where id = p_resource_id::uuid);
    when 'subscription' then return exists(select 1 from app.subscriptions where id = p_resource_id::uuid);
    when 'subscription_period' then return exists(select 1 from app.subscription_periods where id = p_resource_id::uuid);
    when 'renewal_request' then return exists(select 1 from app.renewal_requests where id = p_resource_id::uuid);
    when 'task' then return exists(select 1 from app.tasks where id = p_resource_id::uuid);
    when 'notification' then return exists(select 1 from app.notifications where id = p_resource_id::uuid);
    when 'alert_rule' then return exists(select 1 from app.alert_rules where id = p_resource_id::uuid);
    when 'integration' then return exists(select 1 from app.integrations where id = p_resource_id::uuid);
    when 'user' then return exists(select 1 from app.users where id = p_resource_id::uuid);
    when 'app_setting' then return exists(select 1 from app.app_settings where key = p_resource_id);
    else return false;
  end case;
end $$;

-- NOTA SEGURIDAD: set_config('app.*') en la sesión no sustituye autenticación frente a SQL arbitrario;
-- cualquier cliente con SQL directo puede falsificar GUCs. El backend es la única vía soportada.
create or replace function app.audit_write(
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_changes jsonb default null,
  p_reason text default null,
  p_ip inet default null)
returns bigint
language plpgsql volatile security definer set search_path = app, pg_catalog as $$
declare
  v_actor app.actor_type;
  v_req text;
  v_uid uuid;
  v_iid uuid;
  v_role text;
  v_client uuid;
  v_res_client uuid;
  v_admin boolean;
  v_existing bigint;
  v_id bigint;
  v_changes jsonb;
begin
  v_actor := app.ctx_actor_type();
  v_role := app.ctx_role();
  v_req := nullif(btrim(current_setting('app.request_id', true)), '');
  v_uid := app.ctx_user_id();
  v_iid := app.ctx_integration_id();

  if v_actor is null or v_role is null then
    raise exception 'audit_write requiere contexto app.* en la transacción' using errcode = '42501';
  end if;

  if v_actor = 'system' and not app.is_system() then
    raise exception 'actor system no autorizado en este contexto' using errcode = '42501';
  end if;
  if v_actor = 'user' and v_uid is null then
    raise exception 'actor user requiere app.current_user_id' using errcode = '42501';
  end if;
  if v_actor = 'integration' and v_iid is null then
    raise exception 'actor integration requiere app.integration_id' using errcode = '42501';
  end if;

  if v_actor = 'user' and v_role = 'client' then
    if not (p_resource_type in ('client','client_contact','client_note','subscription','subscription_period',
          'renewal_request','notification')) then
      raise exception 'rol client no puede auditar recurso %', p_resource_type using errcode = '42501';
    end if;
  elsif v_actor = 'user' and v_role = 'operator' and not app.is_operator() then
    raise exception 'contexto operator inválido' using errcode = '42501';
  elsif v_actor = 'user' and v_role = 'admin' and not app.is_admin() then
    raise exception 'contexto admin inválido' using errcode = '42501';
  end if;

  if not app.audit_resource_exists(p_resource_type, p_resource_id)
     and not (p_action in ('auth.login_failed','auth.refresh_reuse_detected') and p_resource_id = 'unknown') then
    raise exception 'recurso %/% no existe', p_resource_type, p_resource_id using errcode = '23503';
  end if;

  v_res_client := app.audit_resolve_client_id(p_resource_type, p_resource_id);
  v_client := app.ctx_client_id();
  if v_actor = 'user' and v_role = 'client' and v_res_client is not null and v_client is distinct from v_res_client then
    raise exception 'client_id del recurso no coincide con el contexto' using errcode = '42501';
  end if;

  v_admin := app.is_admin() or app.is_system();

  if v_req is not null then
    select id into v_existing from app.audit_logs
     where request_id = v_req and action = p_action
       and resource_type = p_resource_type and resource_id = p_resource_id;
    if found then return v_existing; end if;
  end if;

  v_changes := app.audit_prepare_changes(p_action, p_resource_type, p_changes, v_admin);

  insert into app.audit_logs (
    actor_type, actor_user_id, actor_integration_id, action, resource_type, resource_id,
    client_id, changes, reason, request_id, ip)
  values (
    v_actor,
    case when v_actor = 'user' then v_uid else null end,
    case when v_actor = 'integration' then v_iid else null end,
    p_action, p_resource_type, p_resource_id,
    v_res_client, v_changes, p_reason, v_req, p_ip)
  returning id into v_id;
  return v_id;
end $$;

-- OWNER fabsoft_audit_definer: aplicado por provisioner tras dbmate (ALTER OWNER exige superusuario
-- o cadena que el migrator LOGIN no satisface en PG16; ver dbmate-staged-up.ts).
revoke all on function app.audit_is_secret_key(text) from public, fabsoft_app;
revoke all on function app.audit_allowlist_keys(text) from public, fabsoft_app;
revoke all on function app.audit_redact_jsonb(jsonb, text[], boolean) from public, fabsoft_app;
revoke all on function app.audit_redact_jsonb_array(jsonb, text[], boolean) from public, fabsoft_app;
revoke all on function app.audit_prepare_changes(text, text, jsonb, boolean) from public, fabsoft_app;
revoke all on function app.audit_resource_exists(text, text) from public, fabsoft_app;
revoke all on function app.audit_resolve_client_id(text, text) from public, fabsoft_app;
revoke all on function app.audit_write(text, text, text, jsonb, text, inet) from public;
grant execute on function app.audit_write(text, text, text, jsonb, text, inet) to fabsoft_app;

select app.assert_rls_everywhere();

-- migrate:down
drop function if exists app.audit_write(text, text, text, jsonb, text, inet);
drop function if exists app.audit_resource_exists(text, text);
drop function if exists app.audit_resolve_client_id(text, text);
drop function if exists app.audit_prepare_changes(text, text, jsonb, boolean);
drop function if exists app.audit_redact_jsonb_array(jsonb, text[], boolean);
drop function if exists app.audit_redact_jsonb(jsonb, text[], boolean);
drop function if exists app.audit_is_secret_key(text);
drop function if exists app.audit_allowlist_keys(text);
drop index if exists audit_logs_idempotent_uq;

drop policy if exists app_settings_select_audit_definer on app.app_settings;
drop policy if exists users_select_audit_definer on app.users;
drop policy if exists integrations_select_audit_definer on app.integrations;
drop policy if exists alert_rules_select_audit_definer on app.alert_rules;
drop policy if exists notifications_select_audit_definer on app.notifications;
drop policy if exists tasks_select_audit_definer on app.tasks;
drop policy if exists renewal_requests_select_audit_definer on app.renewal_requests;
drop policy if exists subscription_periods_select_audit_definer on app.subscription_periods;
drop policy if exists subscriptions_select_audit_definer on app.subscriptions;
drop policy if exists products_select_audit_definer on app.products;
drop policy if exists client_notes_select_audit_definer on app.client_notes;
drop policy if exists client_contacts_select_audit_definer on app.client_contacts;
drop policy if exists clients_select_audit_definer on app.clients;
drop policy if exists audit_logs_select_audit_definer on app.audit_logs;

grant insert on app.audit_logs to fabsoft_app;
create policy audit_logs_insert on app.audit_logs for insert to fabsoft_app
  with check ((actor_type = 'user' and actor_user_id = app.ctx_user_id())
              or (actor_type = 'integration' and actor_integration_id = app.ctx_integration_id())
              or (actor_type = 'system' and app.is_system()));
