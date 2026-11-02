-- migrate:up
-- =============================================================================
-- FabSoft · 0001_schema.sql
-- Esquema base. Compatible con Supabase (PostgreSQL gestionado) y PostgreSQL 16
-- puro en VPS. Reglas de portabilidad:
--   * Todo vive en el esquema `app` (NO `public`, que Supabase expone por PostgREST).
--   * Sin dependencias de `auth.*`, `storage.*`, `extensions.*` ni `auth.uid()`.
--   * Sin extensiones: gen_random_uuid() es nativo desde PG 13.
--   * Ejecutado por el rol propietario/migrador (dbmate). El rol de ejecución de la
--     aplicación (`fabsoft_app`) se crea y recibe permisos en 0002_rls.sql.
-- Convenciones:
--   * PK uuid (gen_random_uuid()), salvo audit_logs (bigint identity).
--   * Fechas de negocio: DATE inclusivo interpretado en America/Bogota.
--   * Instantes: timestamptz (UTC).
--   * Dinero: numeric(14,2) + currency char(3) restringida a 'COP' en el MVP.
--   * Sin borrado físico en tablas históricas (trigger + REVOKE DELETE en 0002).
-- =============================================================================

create schema if not exists app;
set local search_path = app, pg_catalog;

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
create type app.user_role                 as enum ('admin', 'operator', 'client');
create type app.user_status               as enum ('active', 'disabled');
create type app.client_status             as enum ('active', 'inactive', 'archived');
create type app.product_type              as enum ('third_party', 'own', 'recurring_service');
create type app.product_status            as enum ('active', 'inactive');
create type app.billing_cycle             as enum ('monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'custom');
-- Dimensión 1: vigencia (estado de la suscripción)
create type app.subscription_status       as enum ('pending_activation', 'active', 'in_renewal', 'expired', 'cancelled', 'not_renewed');
-- Dimensión 2: pago (por periodo, nunca inferido de fechas)
create type app.payment_status            as enum ('not_tracked', 'pending', 'received');
-- Dimensión 3: seguimiento comercial
create type app.follow_up_status          as enum ('none', 'in_progress', 'awaiting_client', 'closed');
create type app.renewal_outcome           as enum ('pending', 'renewed', 'not_renewed');
create type app.renewal_request_status    as enum ('pending_review', 'in_progress', 'resolved');
create type app.renewal_request_resolution as enum ('renewed', 'not_renewed', 'other');
create type app.task_type                 as enum ('contact_client', 'send_proposal', 'confirm_terms', 'verify_payment',
                                               'confirm_renewal', 'record_non_renewal', 'review_renewal_request',
                                               'review_expired', 'other');
create type app.task_priority             as enum ('low', 'medium', 'high', 'urgent');
create type app.task_status               as enum ('pending', 'in_progress', 'completed', 'cancelled');
create type app.notification_type         as enum ('expiration_alert', 'renewal_request_created');
create type app.notification_channel      as enum ('in_app', 'email');
create type app.notification_status       as enum ('pending', 'sent', 'failed', 'cancelled');
create type app.integration_status        as enum ('active', 'disabled');
create type app.client_scope              as enum ('all', 'own');
create type app.actor_type                as enum ('user', 'integration', 'system');

-- -----------------------------------------------------------------------------
-- Funciones de soporte (triggers)
-- -----------------------------------------------------------------------------
create or replace function app.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- RN-14: ningún registro histórico se borra físicamente, ni siquiera por el propietario.
create or replace function app.tg_prevent_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'DELETE no permitido en %.%: use archivado/desactivación', tg_table_schema, tg_table_name
    using errcode = 'P0001';
end $$;

-- -----------------------------------------------------------------------------
-- clients (se crea antes que users por la FK users.client_id)
-- -----------------------------------------------------------------------------
create table app.clients (
  id                 uuid primary key default gen_random_uuid(),
  legal_name         text not null check (length(btrim(legal_name)) between 2 and 200),
  tax_id             text null check (tax_id is null or length(btrim(tax_id)) between 3 and 30),
  -- NIT/cédula normalizado (solo dígitos y letras, mayúsculas) para detectar duplicados
  tax_id_normalized  text generated always as (nullif(regexp_replace(upper(coalesce(tax_id, '')), '[^0-9A-Z]', '', 'g'), '')) stored,
  status             app.client_status not null default 'active',
  email              text null check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone              text null check (phone is null or length(phone) <= 30),
  owner_user_id      uuid null,                       -- responsable interno (FK añadida tras crear users)
  archived_at        timestamptz null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid null,
  updated_by         uuid null,
  constraint clients_archived_consistency check ((status = 'archived') = (archived_at is not null))
);
create unique index clients_tax_id_normalized_uq on app.clients (tax_id_normalized) where tax_id_normalized is not null;
create index clients_legal_name_lower_idx on app.clients (lower(legal_name));
create index clients_status_idx on app.clients (status);
create index clients_owner_idx on app.clients (owner_user_id);

-- -----------------------------------------------------------------------------
-- users (perfiles y roles; credenciales propias, sin Supabase Auth)
-- -----------------------------------------------------------------------------
create table app.users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name             text not null check (length(btrim(full_name)) between 2 and 150),
  password_hash         text not null,                 -- argon2id (formato PHC). Nunca texto plano.
  role                  app.user_role not null,
  client_id             uuid null references app.clients(id),
  status                app.user_status not null default 'active',
  must_change_password  boolean not null default true,
  last_login_at         timestamptz null,
  password_changed_at   timestamptz null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid null,
  updated_by            uuid null,
  -- Un usuario del portal siempre pertenece a un cliente; uno interno nunca.
  constraint users_client_role_consistency check ((role = 'client') = (client_id is not null))
);
create unique index users_email_lower_uq on app.users (lower(email));
create index users_client_idx on app.users (client_id) where client_id is not null;
create index users_role_status_idx on app.users (role, status);

alter table app.clients
  add constraint clients_owner_user_fk foreign key (owner_user_id) references app.users(id),
  add constraint clients_created_by_fk foreign key (created_by) references app.users(id),
  add constraint clients_updated_by_fk foreign key (updated_by) references app.users(id);
alter table app.users
  add constraint users_created_by_fk foreign key (created_by) references app.users(id),
  add constraint users_updated_by_fk foreign key (updated_by) references app.users(id);

-- -----------------------------------------------------------------------------
-- refresh_tokens (JWT humano: refresh rotativo con detección de reutilización)
-- -----------------------------------------------------------------------------
create table app.refresh_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app.users(id),
  family_id     uuid not null,                        -- todos los tokens de una misma sesión
  token_hash    text not null,                        -- SHA-256 hex del token opaco
  expires_at    timestamptz not null,
  revoked_at    timestamptz null,
  revoked_reason text null check (revoked_reason is null or revoked_reason in ('rotated','logout','reuse_detected','user_disabled','password_changed','admin')),
  replaced_by   uuid null references app.refresh_tokens(id),
  user_agent    text null,
  ip            inet null,
  created_at    timestamptz not null default now()
);
create unique index refresh_tokens_hash_uq on app.refresh_tokens (token_hash);
create index refresh_tokens_family_idx on app.refresh_tokens (family_id);
create index refresh_tokens_user_active_idx on app.refresh_tokens (user_id) where revoked_at is null;

-- -----------------------------------------------------------------------------
-- client_contacts
-- -----------------------------------------------------------------------------
create table app.client_contacts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references app.clients(id),
  full_name    text not null check (length(btrim(full_name)) between 2 and 150),
  email        text null check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone        text null check (phone is null or length(phone) <= 30),
  role_title   text null check (role_title is null or length(role_title) <= 100),
  is_primary   boolean not null default false,
  archived_at  timestamptz null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint client_contacts_reachable check (email is not null or phone is not null)
);
create index client_contacts_client_idx on app.client_contacts (client_id);
create unique index client_contacts_one_primary_uq on app.client_contacts (client_id) where is_primary and archived_at is null;

-- -----------------------------------------------------------------------------
-- client_notes (notas internas de seguimiento; inmutables)
-- -----------------------------------------------------------------------------
create table app.client_notes (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references app.clients(id),
  author_user_id  uuid not null references app.users(id),
  body            text not null check (length(btrim(body)) between 1 and 5000),
  created_at      timestamptz not null default now()
);
create index client_notes_client_idx on app.client_notes (client_id, created_at desc);

-- -----------------------------------------------------------------------------
-- products (catálogo; sin precios ni fechas de clientes)
-- -----------------------------------------------------------------------------
create table app.products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 2 and 150),
  description     text null check (description is null or length(description) <= 2000),
  product_type    app.product_type not null,
  vendor          text null check (vendor is null or length(vendor) <= 150),   -- proveedor/fabricante
  reference_code  text null check (reference_code is null or length(reference_code) <= 100),
  status          app.product_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid null references app.users(id),
  updated_by      uuid null references app.users(id)
);
create unique index products_name_vendor_uq on app.products (lower(name), lower(coalesce(vendor, '')));
create index products_status_idx on app.products (status);

-- -----------------------------------------------------------------------------
-- subscriptions (licencia/suscripción concreta de un cliente)
-- -----------------------------------------------------------------------------
create table app.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references app.clients(id),          -- RN-01
  product_id            uuid not null references app.products(id),         -- RN-01 / RN-02
  contract_reference    text null check (contract_reference is null or length(contract_reference) <= 120),
  start_date            date not null,
  -- RN-03: último día INCLUSIVO de vigencia del periodo actual, en America/Bogota.
  current_period_end    date not null,
  billing_cycle         app.billing_cycle not null,
  custom_cycle_months   smallint null check (custom_cycle_months is null or custom_cycle_months between 1 and 120),
  price_amount          numeric(14,2) not null check (price_amount >= 0),
  currency              char(3) not null default 'COP' check (currency = 'COP'),
  supplier_cost_amount  numeric(14,2) null check (supplier_cost_amount is null or supplier_cost_amount >= 0),
  renewal_terms         text null check (renewal_terms is null or length(renewal_terms) <= 2000),
  is_renewable          boolean not null default true,
  status                app.subscription_status not null default 'pending_activation',
  follow_up_status      app.follow_up_status not null default 'none',
  visible_in_portal     boolean not null default true,
  owner_user_id         uuid null references app.users(id),                -- responsable interno
  notes                 text null check (notes is null or length(notes) <= 5000),  -- internas, nunca al portal
  cancelled_at          timestamptz null,
  cancellation_reason   text null,
  version               integer not null default 1,                        -- bloqueo optimista
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid null references app.users(id),
  updated_by            uuid null references app.users(id),
  constraint subscriptions_dates_ok check (current_period_end >= start_date),
  constraint subscriptions_custom_cycle check ((billing_cycle = 'custom') = (custom_cycle_months is not null)),
  constraint subscriptions_cancel_consistency check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint subscriptions_id_client_uq unique (id, client_id)             -- destino de FKs compuestas
);
create index subscriptions_client_idx on app.subscriptions (client_id);
create index subscriptions_product_idx on app.subscriptions (product_id);
create index subscriptions_owner_idx on app.subscriptions (owner_user_id);
create index subscriptions_status_idx on app.subscriptions (status);
-- Soporta /subscriptions/expiring, dashboard y job de vencimiento.
create index subscriptions_expiring_idx on app.subscriptions (current_period_end)
  where status in ('active', 'in_renewal');

-- -----------------------------------------------------------------------------
-- subscription_periods (historial inmutable de periodos; RN-04)
-- -----------------------------------------------------------------------------
create table app.subscription_periods (
  id                    uuid primary key default gen_random_uuid(),
  subscription_id       uuid not null references app.subscriptions(id),
  period_number         integer not null check (period_number >= 1),
  start_date            date not null,
  end_date              date not null,
  billing_cycle         app.billing_cycle not null,
  custom_cycle_months   smallint null check (custom_cycle_months is null or custom_cycle_months between 1 and 120),
  price_amount          numeric(14,2) not null check (price_amount >= 0),   -- precio vigente EN ESE periodo
  currency              char(3) not null default 'COP' check (currency = 'COP'),
  supplier_cost_amount  numeric(14,2) null check (supplier_cost_amount is null or supplier_cost_amount >= 0),
  renewal_outcome       app.renewal_outcome not null default 'pending',
  outcome_reason        text null,                                          -- p. ej. motivo de no renovación
  payment_status        app.payment_status not null default 'pending',      -- RN-06/RN-07
  confirmed_at          timestamptz null,
  confirmed_by          uuid null references app.users(id),
  contract_reference    text null check (contract_reference is null or length(contract_reference) <= 120),
  created_at            timestamptz not null default now(),
  created_by            uuid null references app.users(id),
  updated_at            timestamptz not null default now(),
  constraint subscription_periods_dates_ok check (end_date >= start_date),
  constraint subscription_periods_number_uq unique (subscription_id, period_number),
  constraint subscription_periods_start_uq unique (subscription_id, start_date),
  constraint subscription_periods_confirmation check ((renewal_outcome = 'pending') or (confirmed_at is not null))
);
create index subscription_periods_sub_idx on app.subscription_periods (subscription_id, period_number desc);

-- Guardas de inmutabilidad del historial (RN-04): sólo se permiten cambios en
-- renewal_outcome/outcome_reason/confirmed_*/payment_status, y end_date
-- únicamente en el último periodo (corrección de fecha, Flujo E).
create or replace function app.tg_subscription_periods_guard() returns trigger
language plpgsql as $$
declare
  v_last integer;
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from app.subscription_periods p
       where p.subscription_id = new.subscription_id
         and daterange(p.start_date, p.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    ) then
      raise exception 'El periodo se solapa con uno existente de la suscripción %', new.subscription_id
        using errcode = '23P01';
    end if;
    return new;
  end if;

  if new.subscription_id   is distinct from old.subscription_id
     or new.period_number  is distinct from old.period_number
     or new.start_date     is distinct from old.start_date
     or new.billing_cycle  is distinct from old.billing_cycle
     or new.custom_cycle_months is distinct from old.custom_cycle_months
     or new.price_amount   is distinct from old.price_amount
     or new.currency       is distinct from old.currency
     or new.supplier_cost_amount is distinct from old.supplier_cost_amount
     or new.created_at     is distinct from old.created_at
     or new.created_by     is distinct from old.created_by then
    raise exception 'Los periodos históricos son inmutables (subscription_periods.%)', old.id
      using errcode = 'P0001';
  end if;

  if new.end_date is distinct from old.end_date then
    select max(period_number) into v_last from app.subscription_periods where subscription_id = old.subscription_id;
    if old.period_number <> v_last then
      raise exception 'Sólo puede corregirse la fecha de fin del periodo vigente' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger subscription_periods_guard
  before insert or update on app.subscription_periods
  for each row execute function app.tg_subscription_periods_guard();

-- -----------------------------------------------------------------------------
-- renewal_requests (solicitudes desde portal o integración; RN-05)
-- -----------------------------------------------------------------------------
create table app.renewal_requests (
  id                           uuid primary key default gen_random_uuid(),
  subscription_id              uuid not null,
  client_id                    uuid not null,
  requested_by_user_id         uuid null references app.users(id),
  requested_by_integration_id  uuid null,                         -- FK añadida tras crear integrations
  comment                      text null check (comment is null or length(comment) <= 2000),
  status                       app.renewal_request_status not null default 'pending_review',
  assigned_user_id             uuid null references app.users(id),
  resolution                   app.renewal_request_resolution null,
  resolution_note              text null check (resolution_note is null or length(resolution_note) <= 2000),
  resolved_at                  timestamptz null,
  resolved_by                  uuid null references app.users(id),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  -- La solicitud siempre corresponde a una suscripción del MISMO cliente.
  constraint renewal_requests_sub_client_fk foreign key (subscription_id, client_id)
    references app.subscriptions (id, client_id),
  constraint renewal_requests_single_requester check (
    (requested_by_user_id is not null)::int + (requested_by_integration_id is not null)::int = 1),
  constraint renewal_requests_resolution_consistency check (
    (status = 'resolved') = (resolution is not null and resolved_at is not null))
);
create index renewal_requests_client_status_idx on app.renewal_requests (client_id, status, created_at desc);
create index renewal_requests_sub_idx on app.renewal_requests (subscription_id);
create index renewal_requests_status_idx on app.renewal_requests (status, created_at desc);

-- -----------------------------------------------------------------------------
-- alert_rules (política configurable 30/15/7/1/0/post)
-- -----------------------------------------------------------------------------
create table app.alert_rules (
  id                          uuid primary key default gen_random_uuid(),
  code                        text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  description                 text not null,
  -- >0 días ANTES del vencimiento, 0 = día del vencimiento, <0 días DESPUÉS.
  offset_days                 integer not null check (offset_days between -90 and 365),
  channels                    app.notification_channel[] not null default '{in_app}' check (cardinality(channels) >= 1),
  creates_task                boolean not null default false,
  task_type                   app.task_type null,
  task_priority               app.task_priority null,
  applies_when_not_renewable  boolean not null default false,   -- excepción configurada de RN-10
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid null references app.users(id),
  constraint alert_rules_task_consistency check (creates_task = (task_type is not null and task_priority is not null)),
  constraint alert_rules_offset_uq unique (offset_days)
);

-- -----------------------------------------------------------------------------
-- tasks (expuestas en la API como /renewal-tasks)
-- -----------------------------------------------------------------------------
create table app.tasks (
  id                   uuid primary key default gen_random_uuid(),
  task_type            app.task_type not null,
  client_id            uuid not null references app.clients(id),
  subscription_id      uuid null,
  renewal_request_id   uuid null references app.renewal_requests(id),
  alert_rule_id        uuid null references app.alert_rules(id),
  assignee_user_id     uuid null references app.users(id),
  priority             app.task_priority not null default 'medium',
  due_date             date not null,
  status               app.task_status not null default 'pending',
  title                text not null check (length(btrim(title)) between 2 and 200),
  notes                text null check (notes is null or length(notes) <= 5000),
  next_action          text null check (next_action is null or length(next_action) <= 500),
  outcome              text null check (outcome is null or length(outcome) <= 2000),
  completed_at         timestamptz null,
  -- Idempotencia de tareas automáticas: 'alert:<subscription_id>:<rule_code>:<period_end>'
  -- o 'request:<renewal_request_id>'. NULL en tareas manuales.
  dedupe_key           text null,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid null references app.users(id),
  updated_by           uuid null references app.users(id),
  constraint tasks_sub_client_fk foreign key (subscription_id, client_id) references app.subscriptions (id, client_id),
  constraint tasks_completion_consistency check ((status in ('completed', 'cancelled')) = (completed_at is not null))
);
create unique index tasks_dedupe_key_uq on app.tasks (dedupe_key) where dedupe_key is not null;
create index tasks_assignee_status_due_idx on app.tasks (assignee_user_id, status, due_date);
create index tasks_open_due_idx on app.tasks (due_date) where status in ('pending', 'in_progress');
create index tasks_subscription_idx on app.tasks (subscription_id);
create index tasks_client_idx on app.tasks (client_id);

-- -----------------------------------------------------------------------------
-- notifications (alertas in-app y correo; cola persistente del worker)
-- -----------------------------------------------------------------------------
create table app.notifications (
  id                  uuid primary key default gen_random_uuid(),
  notification_type   app.notification_type not null,
  subscription_id     uuid null references app.subscriptions(id),
  task_id             uuid null references app.tasks(id),
  renewal_request_id  uuid null references app.renewal_requests(id),
  alert_rule_id       uuid null references app.alert_rules(id),
  period_end          date null,                 -- vencimiento al que corresponde la alerta
  channel             app.notification_channel not null,
  recipient_user_id   uuid not null references app.users(id),
  scheduled_for       timestamptz not null,
  status              app.notification_status not null default 'pending',
  attempts            smallint not null default 0 check (attempts >= 0),
  max_attempts        smallint not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at     timestamptz null,
  locked_until        timestamptz null,          -- reclamo del worker (patrón claim/commit)
  last_error          text null check (last_error is null or length(last_error) <= 2000),
  provider_message_id text null,
  sent_at             timestamptz null,
  read_at             timestamptz null,          -- sólo canal in_app
  cancelled_at        timestamptz null,
  cancel_reason       text null,
  -- RN-08: 'exp:<subscription_id>:<rule_code>:<period_end>:<channel>:<recipient_user_id>'
  --        'rr:<renewal_request_id>:<channel>:<recipient_user_id>'
  dedupe_key          text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint notifications_dedupe_uq unique (dedupe_key),
  constraint notifications_expiration_fields check (
    notification_type <> 'expiration_alert'
    or (subscription_id is not null and alert_rule_id is not null and period_end is not null)),
  constraint notifications_request_fields check (
    notification_type <> 'renewal_request_created' or renewal_request_id is not null),
  constraint notifications_sent_consistency check ((status = 'sent') = (sent_at is not null)),
  constraint notifications_cancel_consistency check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint notifications_read_only_in_app check (read_at is null or channel = 'in_app')
);
create index notifications_due_idx on app.notifications (scheduled_for, next_attempt_at) where status = 'pending';
create index notifications_recipient_idx on app.notifications (recipient_user_id, status, read_at);
create index notifications_subscription_idx on app.notifications (subscription_id, status);

-- -----------------------------------------------------------------------------
-- integrations, integration_clients, api_credentials
-- -----------------------------------------------------------------------------
create table app.integrations (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),  -- = manifest.integration
  name                   text not null check (length(btrim(name)) between 2 and 120),
  description            text null check (description is null or length(description) <= 2000),
  status                 app.integration_status not null default 'active',
  scopes                 text[] not null default '{}',
  client_scope           app.client_scope not null default 'own',
  manifest               jsonb not null,
  manifest_version       text not null check (manifest_version ~ '^\d+\.\d+\.\d+$'),
  rate_limit_per_minute  integer not null default 60 check (rate_limit_per_minute between 1 and 6000),
  last_used_at           timestamptz null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid null references app.users(id),
  updated_by             uuid null references app.users(id),
  constraint integrations_scopes_valid check (scopes <@ array[
    'clients:read', 'products:read', 'subscriptions:read', 'renewal-tasks:read',
    'renewal-requests:read', 'renewal-requests:write']::text[])
);

alter table app.renewal_requests
  add constraint renewal_requests_integration_fk foreign key (requested_by_integration_id) references app.integrations(id);

create table app.integration_clients (
  integration_id  uuid not null references app.integrations(id),
  client_id       uuid not null references app.clients(id),
  created_at      timestamptz not null default now(),
  created_by      uuid null references app.users(id),
  primary key (integration_id, client_id)
);
create index integration_clients_client_idx on app.integration_clients (client_id);

create table app.api_credentials (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid not null references app.integrations(id),
  key_prefix      text not null check (key_prefix ~ '^fsk_(live|test)_[a-z0-9]{8}$'),  -- público, para búsqueda
  key_hash        text not null,            -- HMAC-SHA256(secret, API_KEY_PEPPER) en hex. Nunca texto plano.
  label           text null check (label is null or length(label) <= 100),
  expires_at      timestamptz null,
  revoked_at      timestamptz null,
  revoked_by      uuid null references app.users(id),
  last_used_at    timestamptz null,
  last_used_ip    inet null,
  created_at      timestamptz not null default now(),
  created_by      uuid null references app.users(id)
);
create unique index api_credentials_prefix_uq on app.api_credentials (key_prefix);
create index api_credentials_integration_idx on app.api_credentials (integration_id) where revoked_at is null;

-- -----------------------------------------------------------------------------
-- idempotency_keys (cabecera Idempotency-Key en POST)
-- -----------------------------------------------------------------------------
create table app.idempotency_keys (
  id               uuid primary key default gen_random_uuid(),
  actor_type       app.actor_type not null check (actor_type in ('user', 'integration')),
  actor_id         uuid not null,
  idem_key         text not null check (length(idem_key) between 8 and 255),
  request_method   text not null,
  request_path     text not null,
  request_hash     text not null,          -- SHA-256 del cuerpo canonicalizado
  response_status  smallint null,          -- NULL mientras la petición está en curso
  response_body    jsonb null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '24 hours',
  constraint idempotency_keys_uq unique (actor_type, actor_id, idem_key)
);
create index idempotency_keys_expires_idx on app.idempotency_keys (expires_at);

-- -----------------------------------------------------------------------------
-- app_settings (configuración general; p. ej. canal de contacto del portal)
-- -----------------------------------------------------------------------------
create table app.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid null references app.users(id)
);

-- -----------------------------------------------------------------------------
-- audit_logs (append-only; RN-13)
-- -----------------------------------------------------------------------------
create table app.audit_logs (
  id                    bigint generated always as identity primary key,
  occurred_at           timestamptz not null default now(),
  actor_type            app.actor_type not null,
  actor_user_id         uuid null references app.users(id),
  actor_integration_id  uuid null references app.integrations(id),
  action                text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),   -- p. ej. 'subscription.renewed'
  resource_type         text not null check (resource_type in (
                          'user', 'client', 'client_contact', 'client_note', 'product', 'subscription',
                          'subscription_period', 'renewal_request', 'task', 'notification', 'alert_rule',
                          'integration', 'api_credential', 'app_setting')),
  resource_id           text not null,
  client_id             uuid null references app.clients(id),          -- para historial por cliente
  changes               jsonb null,           -- {"before":{...},"after":{...}} ya redactado (sin secretos)
  reason                text null check (reason is null or length(reason) <= 1000),
  request_id            text null,
  ip                    inet null,
  constraint audit_logs_actor_consistency check (
    (actor_type = 'user'        and actor_user_id is not null and actor_integration_id is null) or
    (actor_type = 'integration' and actor_integration_id is not null and actor_user_id is null) or
    (actor_type = 'system'      and actor_user_id is null and actor_integration_id is null))
);
create index audit_logs_resource_idx on app.audit_logs (resource_type, resource_id, occurred_at desc);
create index audit_logs_client_idx on app.audit_logs (client_id, occurred_at desc) where client_id is not null;
create index audit_logs_occurred_idx on app.audit_logs (occurred_at desc);
create index audit_logs_actor_user_idx on app.audit_logs (actor_user_id, occurred_at desc) where actor_user_id is not null;

create or replace function app.tg_audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs es append-only' using errcode = 'P0001';
end $$;
create trigger audit_logs_no_update before update or delete on app.audit_logs
  for each row execute function app.tg_audit_logs_immutable();

-- -----------------------------------------------------------------------------
-- Triggers updated_at y no-delete
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','users','client_contacts','products','subscriptions',
                           'renewal_requests','alert_rules','tasks','notifications','integrations']
  loop
    execute format('create trigger %I before update on app.%I for each row execute function app.tg_set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;

  foreach t in array array['clients','users','client_contacts','client_notes','products','subscriptions',
                           'subscription_periods','renewal_requests','tasks','notifications','alert_rules',
                           'integrations','api_credentials']
  loop
    execute format('create trigger %I before delete on app.%I for each row execute function app.tg_prevent_delete()',
                   t || '_prevent_delete', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Datos de referencia mínimos (idempotentes). Datos demo: ver docs/seed-data.md
-- -----------------------------------------------------------------------------
insert into app.alert_rules (code, description, offset_days, channels, creates_task, task_type, task_priority, applies_when_not_renewable) values
  ('D30',   'Preparar la renovación (30 días antes)',            30, '{in_app,email}', true,  'send_proposal',  'medium', false),
  ('D15',   'Contactar al cliente (15 días antes)',              15, '{in_app,email}', true,  'contact_client', 'high',   false),
  ('D7',    'Hacer seguimiento (7 días antes)',                   7, '{in_app,email}', false, null,             null,     false),
  ('D1',    'Vencimiento inminente (1 día antes)',                1, '{in_app,email}', false, null,             null,     false),
  ('D0',    'Comprobar estado (día del vencimiento)',             0, '{in_app}',       false, null,             null,     false),
  ('POST1', 'Suscripción vencida requiere revisión (día +1)',   -1, '{in_app,email}', true,  'review_expired', 'urgent', false)
on conflict (code) do nothing;

insert into app.app_settings (key, value) values
  ('contact_channel', '{"email": "contacto@fabsoft.example", "phone": null, "hours": "Lunes a viernes, 8:00–17:00 (hora Colombia)"}'::jsonb)
on conflict (key) do nothing;

-- migrate:down
drop schema if exists app cascade;
