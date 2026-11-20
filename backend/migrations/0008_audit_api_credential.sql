-- migrate:up
-- =============================================================================
-- Auditoría de credenciales de integración: audit_resource_exists debe
-- reconocer `api_credential` para que api_credential.created/revoked puedan
-- registrar su recurso (RN-13, HU-15.1). El owner de las funciones de
-- auditoría necesita SELECT sobre la tabla y su policy para la comprobación.
-- =============================================================================
grant select (id) on app.api_credentials to fabsoft_audit_definer;
create policy api_credentials_select_audit_definer on app.api_credentials
  for select to fabsoft_audit_definer using (true);

create or replace function app.audit_resource_exists(p_resource_type text, p_resource_id text)
returns boolean
language plpgsql stable security definer set search_path = pg_catalog, app as $$
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
    when 'api_credential' then return exists(select 1 from app.api_credentials where id = p_resource_id::uuid);
    when 'user' then return exists(select 1 from app.users where id = p_resource_id::uuid);
    when 'app_setting' then return exists(select 1 from app.app_settings where key = p_resource_id);
    else return false;
  end case;
end $$;

-- migrate:down
drop policy if exists api_credentials_select_audit_definer on app.api_credentials;
revoke select on app.api_credentials from fabsoft_audit_definer;

create or replace function app.audit_resource_exists(p_resource_type text, p_resource_id text)
returns boolean
language plpgsql stable security definer set search_path = pg_catalog, app as $$
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
