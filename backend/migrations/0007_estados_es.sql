-- migrate:up
-- =============================================================================
-- Estados de negocio en español (solo valores; nombres de tipos/columnas/API
-- permanecen en inglés para no romper la estructura técnica).
-- ALTER TYPE ... RENAME VALUE conserva los OIDs y los datos existentes.
-- =============================================================================

alter type app.user_status rename value 'active' to 'activo';
alter type app.user_status rename value 'disabled' to 'deshabilitado';

alter type app.client_status rename value 'active' to 'activo';
alter type app.client_status rename value 'inactive' to 'inactivo';
alter type app.client_status rename value 'archived' to 'archivado';

alter type app.product_status rename value 'active' to 'activo';
alter type app.product_status rename value 'inactive' to 'inactivo';

alter type app.subscription_status rename value 'pending_activation' to 'pendiente_activacion';
alter type app.subscription_status rename value 'active' to 'activa';
alter type app.subscription_status rename value 'in_renewal' to 'en_renovacion';
alter type app.subscription_status rename value 'expired' to 'vencida';
alter type app.subscription_status rename value 'cancelled' to 'cancelada';
alter type app.subscription_status rename value 'not_renewed' to 'no_renovada';

alter type app.payment_status rename value 'not_tracked' to 'sin_seguimiento';
alter type app.payment_status rename value 'pending' to 'pendiente';
alter type app.payment_status rename value 'received' to 'recibido';

alter type app.follow_up_status rename value 'none' to 'sin_gestion';
alter type app.follow_up_status rename value 'in_progress' to 'en_gestion';
alter type app.follow_up_status rename value 'awaiting_client' to 'esperando_cliente';
alter type app.follow_up_status rename value 'closed' to 'cerrado';

alter type app.renewal_outcome rename value 'pending' to 'pendiente';
alter type app.renewal_outcome rename value 'renewed' to 'renovada';
alter type app.renewal_outcome rename value 'not_renewed' to 'no_renovada';

alter type app.renewal_request_status rename value 'pending_review' to 'pendiente_revision';
alter type app.renewal_request_status rename value 'in_progress' to 'en_progreso';
alter type app.renewal_request_status rename value 'resolved' to 'resuelta';

alter type app.renewal_request_resolution rename value 'renewed' to 'renovada';
alter type app.renewal_request_resolution rename value 'not_renewed' to 'no_renovada';
alter type app.renewal_request_resolution rename value 'other' to 'otra';

alter type app.task_status rename value 'pending' to 'pendiente';
alter type app.task_status rename value 'in_progress' to 'en_progreso';
alter type app.task_status rename value 'completed' to 'completada';
alter type app.task_status rename value 'cancelled' to 'cancelada';

alter type app.notification_status rename value 'pending' to 'pendiente';
alter type app.notification_status rename value 'sent' to 'enviada';
alter type app.notification_status rename value 'failed' to 'fallida';
alter type app.notification_status rename value 'cancelled' to 'cancelada';

alter type app.integration_status rename value 'active' to 'activa';
alter type app.integration_status rename value 'disabled' to 'deshabilitada';

-- Las funciones con SQL en texto no se actualizan con RENAME VALUE.
create or replace function app.integration_sees_client(p_client_id uuid) returns boolean
language sql stable as $$
  select app.is_integration() and exists (
    select 1 from app.integrations i
     where i.id = app.ctx_integration_id()
       and i.status = 'activa'
       and (i.client_scope = 'all'
            or exists (select 1 from app.integration_clients ic
                        where ic.integration_id = i.id and ic.client_id = p_client_id)))
$$;

-- Policies con literales de enum: se recrean para que la expresión quede estable.
drop policy if exists clients_insert on app.clients;
create policy clients_insert on app.clients for insert to fabsoft_app
  with check (app.is_staff() and status <> 'archivado');
drop policy if exists clients_update on app.clients;
create policy clients_update on app.clients for update to fabsoft_app
  using (app.is_admin() or (app.is_operator() and status <> 'archivado'))
  with check (app.is_admin() or (app.is_operator() and status <> 'archivado'));

drop policy if exists subscriptions_insert on app.subscriptions;
create policy subscriptions_insert on app.subscriptions for insert to fabsoft_app
  with check (app.is_staff() and status in ('pendiente_activacion', 'activa'));
drop policy if exists subscriptions_update on app.subscriptions;
create policy subscriptions_update on app.subscriptions for update to fabsoft_app
  using (app.is_admin() or app.is_system() or (app.is_operator() and status <> 'cancelada'))
  with check (app.is_admin() or app.is_system() or (app.is_operator() and status <> 'cancelada'));

drop policy if exists renewal_requests_insert on app.renewal_requests;
create policy renewal_requests_insert on app.renewal_requests for insert to fabsoft_app
  with check (
    status = 'pendiente_revision' and (
      (app.is_staff() and requested_by_user_id = app.ctx_user_id())
      or (app.is_client_user() and client_id = app.ctx_client_id() and requested_by_user_id = app.ctx_user_id())
      or (app.integration_sees_client(client_id) and requested_by_integration_id = app.ctx_integration_id())));

-- Verificación de integridad: los valores de enum deben quedar en español.
do $$
declare
  bad text;
begin
  select string_agg(format('%s.%s', t.typname, e.enumlabel), ', ')
    into bad
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'app'
     and t.typname in (
       'user_status', 'client_status', 'product_status', 'subscription_status',
       'payment_status', 'follow_up_status', 'renewal_outcome',
       'renewal_request_status', 'renewal_request_resolution', 'task_status',
       'notification_status', 'integration_status'
     )
     and e.enumlabel in (
       'active', 'inactive', 'archived', 'disabled', 'pending_activation',
       'in_renewal', 'expired', 'cancelled', 'not_renewed', 'not_tracked',
       'pending', 'received', 'in_progress', 'awaiting_client', 'closed',
       'pending_review', 'resolved', 'renewed', 'completed', 'sent', 'failed',
       'none', 'other'
     );
  if bad is not null then
    raise exception 'Quedaron etiquetas de estado en inglés: %', bad;
  end if;
end $$;

-- migrate:down
alter type app.integration_status rename value 'deshabilitada' to 'disabled';
alter type app.integration_status rename value 'activa' to 'active';

alter type app.notification_status rename value 'cancelada' to 'cancelled';
alter type app.notification_status rename value 'fallida' to 'failed';
alter type app.notification_status rename value 'enviada' to 'sent';
alter type app.notification_status rename value 'pendiente' to 'pending';

alter type app.task_status rename value 'cancelada' to 'cancelled';
alter type app.task_status rename value 'completada' to 'completed';
alter type app.task_status rename value 'en_progreso' to 'in_progress';
alter type app.task_status rename value 'pendiente' to 'pending';

alter type app.renewal_request_resolution rename value 'otra' to 'other';
alter type app.renewal_request_resolution rename value 'no_renovada' to 'not_renewed';
alter type app.renewal_request_resolution rename value 'renovada' to 'renewed';

alter type app.renewal_request_status rename value 'resuelta' to 'resolved';
alter type app.renewal_request_status rename value 'en_progreso' to 'in_progress';
alter type app.renewal_request_status rename value 'pendiente_revision' to 'pending_review';

alter type app.renewal_outcome rename value 'no_renovada' to 'not_renewed';
alter type app.renewal_outcome rename value 'renovada' to 'renewed';
alter type app.renewal_outcome rename value 'pendiente' to 'pending';

alter type app.follow_up_status rename value 'cerrado' to 'closed';
alter type app.follow_up_status rename value 'esperando_cliente' to 'awaiting_client';
alter type app.follow_up_status rename value 'en_gestion' to 'in_progress';
alter type app.follow_up_status rename value 'sin_gestion' to 'none';

alter type app.payment_status rename value 'recibido' to 'received';
alter type app.payment_status rename value 'pendiente' to 'pending';
alter type app.payment_status rename value 'sin_seguimiento' to 'not_tracked';

alter type app.subscription_status rename value 'no_renovada' to 'not_renewed';
alter type app.subscription_status rename value 'cancelada' to 'cancelled';
alter type app.subscription_status rename value 'vencida' to 'expired';
alter type app.subscription_status rename value 'en_renovacion' to 'in_renewal';
alter type app.subscription_status rename value 'activa' to 'active';
alter type app.subscription_status rename value 'pendiente_activacion' to 'pending_activation';

alter type app.product_status rename value 'inactivo' to 'inactive';
alter type app.product_status rename value 'activo' to 'active';

alter type app.client_status rename value 'archivado' to 'archived';
alter type app.client_status rename value 'inactivo' to 'inactive';
alter type app.client_status rename value 'activo' to 'active';

alter type app.user_status rename value 'deshabilitado' to 'disabled';
alter type app.user_status rename value 'activo' to 'active';

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

drop policy if exists clients_insert on app.clients;
create policy clients_insert on app.clients for insert to fabsoft_app
  with check (app.is_staff() and status <> 'archived');
drop policy if exists clients_update on app.clients;
create policy clients_update on app.clients for update to fabsoft_app
  using (app.is_admin() or (app.is_operator() and status <> 'archived'))
  with check (app.is_admin() or (app.is_operator() and status <> 'archived'));

drop policy if exists subscriptions_insert on app.subscriptions;
create policy subscriptions_insert on app.subscriptions for insert to fabsoft_app
  with check (app.is_staff() and status in ('pending_activation', 'active'));
drop policy if exists subscriptions_update on app.subscriptions;
create policy subscriptions_update on app.subscriptions for update to fabsoft_app
  using (app.is_admin() or app.is_system() or (app.is_operator() and status <> 'cancelled'))
  with check (app.is_admin() or app.is_system() or (app.is_operator() and status <> 'cancelled'));

drop policy if exists renewal_requests_insert on app.renewal_requests;
create policy renewal_requests_insert on app.renewal_requests for insert to fabsoft_app
  with check (
    status = 'pending_review' and (
      (app.is_staff() and requested_by_user_id = app.ctx_user_id())
      or (app.is_client_user() and client_id = app.ctx_client_id() and requested_by_user_id = app.ctx_user_id())
      or (app.integration_sees_client(client_id) and requested_by_integration_id = app.ctx_integration_id())));
