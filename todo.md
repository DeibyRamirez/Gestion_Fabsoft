# Todo — FabSoft

Backlog de construcción. Un corte a la vez. Estados: `hecho`, `en curso`, `pendiente`.

Al cerrar un corte: cambiar su estado aquí y añadir una línea en la bitácora de [`memory.md`](memory.md). Cada ítem dice el resultado observable. El diseño está en `docs/`; no se amplía el alcance desde esta lista.

El corte activo es Sprint 2 (renovaciones, tareas y alertas). El detalle por bloques está abajo; los ítems de `Pendiente` siguen siendo el backlog de producto.

## Hecho

- **Cimientos** — `hecho`. Monorepo pnpm, PostgreSQL 16 en Docker, migraciones `0001`–`0005`, seed, alta de admin y generación de claves JWT. CI: lint, typecheck, tests, build y job de migraciones/RLS.
- **Health** — `hecho`. `GET /api/v1/health` y `GET /api/v1/health/ready`. `/dashboard` muestra solo el estado del API.
- **Auth** — `hecho`. `POST /api/v1/auth/login`, `refresh`, `logout`, `change-password` y `GET /api/v1/auth/me`. Pantallas `/login` y `/change-password`. Sesión con JWT y refresh en cookie.
- **Usuarios** — `hecho`. `GET/POST /api/v1/users`, `GET/PATCH /api/v1/users/{id}`, `POST /api/v1/users/{id}/reset-password`. Pantalla `/admin/users`, solo admin.
- **Productos (HU-05)** — `hecho`. Catálogo `third_party`, `own`, `recurring_service`, activo/inactivo, sin precio ni periodicidad. `GET/POST /api/v1/products`, `GET/PATCH /api/v1/products/{id}` y pantalla `/admin/products` con alta, edición y activar/desactivar; desactivar no altera suscripciones existentes.
- **Clientes CRUD (HU-03)** — `hecho` (rama `cursor/hu03-clients-crud`). API `/api/v1/clients` con RBAC, 409 `client_tax_id_taken` (extensiones), idempotencia en POST, auditoría y frontend de listado/alta/ficha.
- **Contactos de cliente (HU-04)** — `hecho`. `/api/v1/clients/{id}/contacts` (list/create/PATCH), un único principal (RN-16), baja lógica (RN-14), RBAC admin/operator, auditoría `client_contact.*`, panel de contactos en la ficha y tests HU-04/RN-16/E2E.
- **Auditoría (HU-08)** — `hecho`. `GET /api/v1/audit-logs` (admin, con before/after vía `app.audit_log_changes_for_reader`), pantalla `/admin/audit` con filtros y detalle before/after, y `GET /api/v1/clients/{id}/activity` (admin/operator, sin before/after, con `summary`) visible en la ficha del cliente; auditoría append-only y tests unit/API/integración/E2E.
- **Idempotencia y RLS** — `hecho`. Middleware de idempotencia HTTP y contexto RLS por transacción en la API.
- **Sistema de diseño (HU-02)** — `hecho`. Tailwind CSS 4 + tokens en `globals.css`, shadcn/ui en `src/shared/ui`, `AppShell` / `PortalShell`, skip link y pantallas existentes estilizadas (login, cambio de contraseña, panel, usuarios, portal).

## Sprint 2 — en curso

Orden por dependencias. Un bloque se cierra con código, tests y esta lista actualizada. Contexto y decisiones en [`memory.md`](memory.md).

- **Bloque 0 — Base** — `hecho`. `pg-boss` 9; esquemas Zod compartidos (tareas, notificaciones, reglas, solicitudes, dashboard); enums y auditoría; `worker-env` con `CORREO_CANAL`, `RESEND_API_KEY`, `CORREO_DESDE`, `RESEND_MAX_RPS`; `.env.example` y docs.
- **Bloque 1 — HU-09.2 + acciones de renovación** — `hecho`. `POST /start-renewal`, `POST /not-renewed`, `POST /correct-expiration`, `PATCH /periods/{periodId}`; renovación devuelve seguimiento a `none`; UI con acciones y pago por periodo; unit/API/DB guard tests RN-03/RN-04/RN-06/RN-07. Verificado en Postgres 18 temporal: 17 API + 3 integración en verde.
- **Bloque 2 — HU-11.1 motor de alertas** — `hecho`. Programación en la misma transacción (activar, renovar, corregir, no renovar, cancelar y `isRenewable`), dedupe RN-08, elegibilidad RN-10, destinatario responsable→cliente→admins y cancelación de reglas inactivas; `ReconcileAlerts` + CLI `pnpm alerts:reconcile`. Tests unitarios y 8 de integración RN-08/RN-09/RN-10 en verde.
- **Bloque 3 — HU-10 tareas** — `hecho`. `/api/v1/renewal-tasks` (list con filtros, create idempotente, get, PATCH, complete/cancel), UI `/tasks` y `/tasks/[taskId]`, tareas automáticas desde reglas (dedupe, vencimiento y asignación), cierre al renovar/corregir/no renovar/cancelar y resolución de solicitudes al renovar. API 4 + integración 8 en verde.
- **Bloque 4 — HU-11.2 worker + Resend + notificaciones** — `hecho`. Worker pg-boss con `subscriptions.expire`, `alerts.reconcile`, `notifications.dispatch` (SKIP LOCKED, backoff, revalidación RN-10) y `maintenance.cleanup`; instalador `db:pgboss:install`; adaptador Resend (`fetch`, rate limit, 429/5xx) y log; `/api/v1/notifications` + bandeja `/notifications`. API 3 + integración worker 5 en verde.
- **Bloque 5 — HU-12 dashboard** — `siguiente`. `/api/v1/dashboard/summary` y `/activity`; KPIs navegables y actividad en `/dashboard`.
- **Bloque 6 — HU-13 umbrales** — `pendiente`. `/api/v1/alert-rules` y `/admin/alert-rules`; solo umbrales/canales/tareas, sin plantilla editable.
- **Bloque 7 — Cierre** — `pendiente`. Tests de contrato/integración/E2E, CI verde y handoff de despliegue Render/Vercel/Neon (proxy `/api/v1` en Vercel, seed cloud por dump).

## Pendiente

- **Clientes (notas/actividad)** — `pendiente`. Subrecursos `/notes` y `/activity` y portal con datos. El CRUD base (HU-03) y los contactos (HU-04) ya están hechos.
- **Suscripciones** — `hecho` (HU-06.1/06.2/07 + HU-09.2). Dominio (`LocalDate`, ciclo, máquina de estados, periodo inmutable), API `GET/POST /api/v1/subscriptions`, `GET/PATCH /{id}`, `/{id}/activate`, `/{id}/cancel` (admin), `/{id}/renew`, `/{id}/start-renewal`, `/{id}/not-renewed`, `/{id}/correct-expiration`, `GET /{id}/periods`, `PATCH /{id}/periods/{periodId}`; idempotencia, versión optimista, `?productId`, RBAC; web `/subscriptions*` con historial, acciones de renovación/no renovación/corrección y pago manual por periodo. Tests de integración RN-03/RN-04/RN-06/RN-07 ejecutados.
- **Solicitudes y tareas** — `en curso`. Tareas de renovación `hecho` (API, automatización y `/tasks`); solicitudes `pendiente` (CRUD y `/renewal-requests`), salvo la resolución automática al renovar ya implementada.
- **Alertas y worker** — `hecho` (HU-11). Motor en línea, tareas automáticas, reconcile, worker pg-boss, dispatch/backoff, expiración, limpieza, adaptadores Resend/log, API `/notifications` y bandeja `/notifications`; falta `/api/v1/alert-rules` y `/admin/alert-rules` (Bloque 6). Tests RN-08/RN-09/RN-10 cubiertos; T-RN08-02 concurrente queda en cierre/CI.
- **Dashboard y portal** — `pendiente`. KPIs y actividad en `/dashboard` (`/api/v1/dashboard/summary` y `/activity`). Portal con suscripciones, solicitud de renovación y contacto (`/api/v1/portal/*`, pantallas bajo `/portal`). RN-11.
- **Integraciones** — `pendiente`. Manifest, API keys hasheadas, scopes, alcance de clientes y rate limit. `/api/v1/integrations`. Pantallas `/admin/integrations`. RN-12.
- **Settings** — `pendiente`. `GET /api/v1/settings` y `PATCH /api/v1/settings`. Pantalla `/admin/settings`.
- **Pruebas de contrato** — `pendiente`. Tests `T-RNxx` que falten, suite RLS parametrizada y deriva del OpenAPI (redocly / zod-to-openapi) según [`docs/testing-strategy.md`](docs/testing-strategy.md).

## No bloqueante

- **ClickUp** — `hecho` (2026-11-19). Contraste vía API v2 y cierre autorizado: Sprint 0/1 completos; Sprint 2 con HU-09/09.1/09.2, HU-10 y HU-11/11.1/11.2 en `complete`, y HU-12/HU-13 pendientes; Sprint 3 sin cambios. Backlog con HU-16 (export CSV, sin requisito en `docs/`) y W-01–W-04 fuera del MVP. Resultado en `memory.md`. Los estados los decide el PO.
