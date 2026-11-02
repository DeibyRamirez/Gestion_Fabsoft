# Matriz de permisos — rol × recurso × acción

> Se aplica en tres niveles: (1) middleware `requireRole`/`requireScope` por ruta, (2) guardas del caso de uso (campos sensibles, transiciones), (3) RLS (`0002_rls.sql`). Ocultar botones en el frontend es sólo UX (§5 funcional).

Leyenda: ✅ permitido · ❌ denegado · 🔒 permitido con restricción (ver nota) · `scope` = requiere ese scope en el manifest de la integración, siempre limitado a su `client_scope`.

| Recurso | Acción | Endpoint(s) | Admin | Operador | Cliente | Integración |
|---|---|---|---|---|---|---|
| Sesión | Login / refresh / logout / me / cambiar contraseña | `/auth/*` | ✅ | ✅ | ✅ | ❌ |
| Usuarios | Listar / ver | `GET /users`, `GET /users/{id}` | ✅ | ❌ | ❌ | ❌ |
| Usuarios | Crear / editar / desactivar / resetear contraseña | `POST /users`, `PATCH /users/{id}`, `POST /users/{id}/reset-password` | 🔒¹ | ❌ | ❌ | ❌ |
| Clientes | Listar / ver | `GET /clients`, `GET /clients/{id}` | ✅ | ✅ | ❌ (usa `/portal/me`) | `clients:read` |
| Clientes | Crear / editar | `POST /clients`, `PATCH /clients/{id}` | ✅ | ✅ | ❌ | ❌ |
| Clientes | Archivar / reactivar | `POST /clients/{id}/archive`, `/reactivate` | ✅ | ❌ | ❌ | ❌ |
| Contactos | Listar / crear / editar / archivar | `/clients/{id}/contacts*` | ✅ | ✅ | ❌ | ❌ |
| Notas internas | Listar / crear | `/clients/{id}/notes` | ✅ | ✅ | ❌ | ❌ |
| Historial de cliente | Ver | `GET /clients/{id}/activity` | ✅ | ✅ | ❌ | ❌ |
| Productos | Listar / ver | `GET /products*` | ✅ | ✅ | ❌ | `products:read` |
| Productos | Crear / editar / desactivar | `POST /products`, `PATCH /products/{id}` | ✅ | ❌ | ❌ | ❌ |
| Suscripciones | Listar / ver / por vencer / periodos | `GET /subscriptions*` | ✅ | ✅ | ❌ (usa `/portal/subscriptions`) | `subscriptions:read` 🔒² |
| Suscripciones | Crear | `POST /subscriptions` | ✅ | 🔒³ | ❌ | ❌ |
| Suscripciones | Editar campos no sensibles | `PATCH /subscriptions/{id}` | ✅ | ✅ | ❌ | ❌ |
| Suscripciones | Cambiar precio / costo de proveedor | `PATCH /subscriptions/{id}` (`priceAmount`, `supplierCostAmount`) | ✅ | ❌ | ❌ | ❌ |
| Suscripciones | Activar / iniciar renovación / renovar / no renovada | `POST .../activate`, `/start-renewal`, `/renew`, `/not-renewed` | ✅ | ✅ | ❌ | ❌ |
| Suscripciones | Corregir vencimiento (con motivo) | `POST .../correct-expiration` | ✅ | ✅ | ❌ | ❌ |
| Suscripciones | Cancelar | `POST .../cancel` | ✅ | ❌ | ❌ | ❌ |
| Periodos | Cambiar estado de pago | `PATCH /subscriptions/{id}/periods/{periodId}` | ✅ | ✅ | ❌ | ❌ |
| Alertas de suscripción | Ver | `GET /subscriptions/{id}/notifications` | ✅ | ✅ | ❌ | ❌ |
| Solicitudes de renovación | Listar / ver | `GET /renewal-requests*` | ✅ | ✅ | ❌ (usa portal) | `renewal-requests:read` |
| Solicitudes de renovación | Crear | `POST /renewal-requests` | ✅ | ✅ | ❌ (usa portal) | `renewal-requests:write` 🔒⁴ |
| Solicitudes de renovación | Asignar / en gestión / resolver | `PATCH /renewal-requests/{id}`, `POST .../resolve` | ✅ | ✅ | ❌ | ❌ |
| Tareas | Listar / ver | `GET /renewal-tasks*` | ✅ | ✅ | ❌ | `renewal-tasks:read` |
| Tareas | Crear / editar / completar / cancelar | `POST/PATCH /renewal-tasks*` | ✅ | ✅ | ❌ | ❌ |
| Alertas | Ver bandeja y registro / marcar leída | `GET /notifications`, `POST .../read` | ✅ | ✅ | ❌ | ❌ |
| Alertas | Reintentar fallida | `POST /notifications/{id}/retry` | ✅ | ❌ | ❌ | ❌ |
| Reglas de alerta | Ver | `GET /alert-rules` | ✅ | ✅ | ❌ | ❌ |
| Reglas de alerta | Configurar | `PATCH /alert-rules/{id}` | ✅ | ❌ | ❌ | ❌ |
| Dashboard | Ver indicadores y actividad | `GET /dashboard/*` | ✅ | ✅ | ❌ | ❌ |
| Portal | Perfil, suscripciones, periodos, solicitudes (ver/crear) | `/portal/*` | ❌ | ❌ | 🔒⁵ | ❌ |
| Integraciones | Listar / ver / crear / editar / manifest / desactivar | `/integrations*` | ✅ | ❌ | ❌ | ❌ |
| Credenciales API | Emitir / listar / revocar | `/integrations/{id}/credentials*` | ✅ | ❌ | ❌ | ❌ |
| Auditoría | Consultar completa | `GET /audit-logs` | ✅ | ❌ | ❌ | ❌ |
| Configuración | Ver | `GET /settings` | ✅ | ✅ | ❌ | ❌ |
| Configuración | Editar | `PATCH /settings` | ✅ | ❌ | ❌ | ❌ |

Notas:
1. Un admin no puede desactivarse a sí mismo ni quitarse el rol admin si es el último admin activo (`422 invalid_state_transition`).
2. Las integraciones nunca reciben `supplierCostAmount` ni `notes` (aplicado también en BD desde `0004`: vistas `app.integration_subscriptions`/`app.integration_subscription_periods`).
3. El operador no puede fijar `supplierCostAmount` al crear (sólo admin).
4. Sólo sobre suscripciones de clientes dentro de su alcance; `Idempotency-Key` obligatoria.
5. Sólo su organización (`client_id` del usuario) y suscripciones con `visible_in_portal=true`; sin costo, notas, responsable ni estado de pago. Recursos ajenos ⇒ `404`.

## Operaciones sensibles (sólo admin) — resumen

Gestión de usuarios y roles, archivar clientes, catálogo de productos, cancelar suscripciones, cambiar precio/costo, reglas de alerta, configuración, integraciones y credenciales, consulta completa de auditoría y reintento de alertas fallidas.

## Mapeo a RLS (defensa en profundidad)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | staff, system, la propia fila (sin columna `password_hash`; ver `app.auth_password_hash`) | admin | admin, system, propia fila (columnas privilegiadas bloqueadas por trigger) | ❌ |
| `refresh_tokens` | system | system | system | system |
| `clients` | staff, system, cliente propio, integración en alcance | staff (no archivado) | admin; operador si no archivado y sin archivar | ❌ |
| `client_contacts` | staff, system, integración en alcance (cliente ❌ desde `0003`) | staff | staff | ❌ |
| `client_notes` | staff | staff (autor = usuario) | ❌ | ❌ |
| `products` | staff, system, integración, cliente (sólo productos de sus suscripciones visibles) | admin | admin | ❌ |
| `subscriptions` | staff, system; cliente sólo vía vista `portal_subscriptions` (0003); integración sólo vía vista `integration_subscriptions` con scope `subscriptions:read` y su `client_scope` (0004) | staff (costo sólo admin, trigger) | admin, system; operador salvo cancelar y salvo precio/costo (trigger `subscriptions_guard_pricing`) | ❌ |
| `subscription_periods` | staff, system; cliente sólo vía vista `portal_subscription_periods` (0003); integración sólo vía vista `integration_subscription_periods` (0004, mismo scope y alcance) | staff | staff (trigger de inmutabilidad) | ❌ |
| `renewal_requests` | staff, system, cliente propio, integración en alcance | staff, cliente propio, integración en alcance (siempre `pending_review`) | staff, system | ❌ |
| `tasks` | staff, system, integración en alcance | staff, system | staff, system | ❌ |
| `notifications` | staff, system | staff, system | staff, system | ❌ |
| `alert_rules` | staff, system | admin | admin | ❌ |
| `app_settings` | staff, system, cliente (`contact_channel`) | admin | admin | ❌ |
| `integrations` | admin, system, la propia integración | admin | admin, system | ❌ |
| `integration_clients` | admin, system, la propia integración | admin | — | admin |
| `api_credentials` | admin, system | admin | admin, system | ❌ |
| `idempotency_keys` | actor propietario, system | actor propietario | actor propietario | system (políticas separadas desde `0003`) |
| `audit_logs` | admin, system, operador (recursos de negocio) | cualquier actor = contexto | ❌ | ❌ |

*staff* = admin u operador (usuario humano interno).

## Roles de base de datos (no son roles de negocio)

| Rol | Uso | BYPASSRLS | Privilegios |
|---|---|---|---|
| `fabsoft_app` | API (`DATABASE_URL`) | ❌ | DML en `app` según RLS; DML en `pgboss` (encolar); sin `CREATE` en la BD ni en `app`; sin `SELECT` sobre `users.password_hash` |
| `fabsoft_worker` | Worker (`WORKER_DATABASE_URL`) | ❌ | Miembro de `fabsoft_app` (mismas políticas, contexto system); propietario del esquema `pgboss` |
| `fabsoft_secure_view` | NOLOGIN; propietario de vistas del portal y funciones `SECURITY DEFINER` | ❌ | `SELECT` sólo de columnas permitidas, con políticas propias |
| `postgres` (Supabase) / `fabsoft_owner` (VPS) | Migraciones (dbmate) | ✅ | Propietario; nunca en contenedores |
