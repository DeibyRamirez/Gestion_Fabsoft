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
- **Seguridad de login** — `hecho`. Rate limit configurable por IP y por IP+email, bloqueo temporal de IP tras fallos 401, botón mostrar/ocultar contraseña y prueba de inyección SQL con consultas parametrizadas.
- **Estados de negocio en español** — `hecho` (2026-11-19). Migración `0007` renombra los valores de los 12 enums de estado y recrea función/policies; API, frontend, seed, tests, OpenAPI y docs usan los valores en español. Los nombres técnicos (tipos, columnas, campos, roles, ciclos, canales, scopes, motivos y acciones de auditoría) siguen en inglés. Cambio breaking: `status=active` pasa a `status=activa`.

## Sprint 2 — en curso

Orden por dependencias. Un bloque se cierra con código, tests y esta lista actualizada. Contexto y decisiones en [`memory.md`](memory.md).

- **Bloque 0 — Base** — `hecho`. `pg-boss` 9; esquemas Zod compartidos (tareas, notificaciones, reglas, solicitudes, dashboard); enums y auditoría; `worker-env` con `CORREO_CANAL`, `RESEND_API_KEY`, `CORREO_DESDE`, `RESEND_MAX_RPS`; `.env.example` y docs.
- **Bloque 1 — HU-09.2 + acciones de renovación** — `hecho`. `POST /start-renewal`, `POST /not-renewed`, `POST /correct-expiration`, `PATCH /periods/{periodId}`; renovación devuelve seguimiento a `none`; UI con acciones y pago por periodo; unit/API/DB guard tests RN-03/RN-04/RN-06/RN-07. Verificado en Postgres 18 temporal: 17 API + 3 integración en verde.
- **Bloque 2 — HU-11.1 motor de alertas** — `hecho`. Programación en la misma transacción (activar, renovar, corregir, no renovar, cancelar y `isRenewable`), dedupe RN-08, elegibilidad RN-10, destinatario responsable→cliente→admins y cancelación de reglas inactivas; `ReconcileAlerts` + CLI `pnpm alerts:reconcile`. Tests unitarios y 8 de integración RN-08/RN-09/RN-10 en verde.
- **Bloque 3 — HU-10 tareas** — `hecho`. `/api/v1/renewal-tasks` (list con filtros, create idempotente, get, PATCH, complete/cancel), UI `/tasks` y `/tasks/[taskId]`, tareas automáticas desde reglas (dedupe, vencimiento y asignación), cierre al renovar/corregir/no renovar/cancelar y resolución de solicitudes al renovar. API 4 + integración 8 en verde.
- **Bloque 4 — HU-11.2 worker + Resend + notificaciones** — `hecho`. Worker pg-boss con `subscriptions.expire`, `alerts.reconcile`, `notifications.dispatch` (SKIP LOCKED, backoff, revalidación RN-10) y `maintenance.cleanup`; instalador `db:pgboss:install`; adaptador Resend (`fetch`, rate limit, 429/5xx) y log; `/api/v1/notifications` + bandeja `/notifications`. API 3 + integración worker 5 en verde.
- **Bloque 5 — HU-12 dashboard** — `hecho`. `/api/v1/dashboard/summary` (9 KPIs) y `/activity`; `/dashboard` con tarjetas navegables, “Mis tareas de hoy” y actividad; filtros `expiresFrom/expiresTo` en suscripciones; lista read-only `/renewal-requests`.
- **Bloque 6 — HU-13 umbrales** — `hecho`. `/api/v1/alert-rules` (lectura) y `PATCH /alert-rules/{id}` (admin), `/admin/alert-rules`; umbrales/canales/tareas, validación de offset único y auditoría. La plantilla de correo sigue fija (decisión de `docs/`).
- **Bloque 7 — Cierre** — `pendiente`. Tests de contrato/integración/E2E, CI verde y handoff de despliegue Render/Vercel/Neon (proxy `/api/v1` en Vercel, seed cloud por dump).

## Sprint 3 — en curso

- **Bloque 1 — Portal del cliente (HU-14)** — `hecho`. `/api/v1/portal/*`, `/portal` con suscripciones, detalle, periodos, solicitud y contacto; `CreateRenewalRequest` + tarea/notificaciones idempotentes; tests RN-05/RN-11 y frontend.
- **Bloque 2 — API keys e integraciones (HU-15.1)** — `hecho`. Manifest validado, CRUD de integraciones, credenciales HMAC con pepper y máximo 2 activas, `authenticateApiKey`/`requireScope`, `/api/v1/integrations/*` y `/admin/integrations`; migración `0008_audit_api_credential.sql` para auditoría de API credentials.
- **Bloque 3 — API pública v1 y rate limiting (HU-15.2)** — `hecho`. Endpoints de integración con `X-Api-Key`, scopes, alcance `own/all`, proyecciones sin datos internos, idempotencia de integración, `POST /renewal-requests` y rate limit por manifest; `GET /subscriptions/expiring` también para humanos.
- **Bloque 4 — OpenAPI navegable (HT-09)** — `hecho`. `docs/api/openapi.json` generado desde el YAML (`openapi:build`/`openapi:check`), Swagger UI en `GET /api/v1/docs` con assets locales, `GET /api/v1/docs/openapi.json`, operaciones pendientes marcadas `x-implementation-status`, cobertura automática de rutas Express vs OpenAPI y test de sincronía JSON/YAML. Añadido `GET /api/v1/renewal-requests/{id}` humano para completar el contrato.
- **Bloque 5 — E2E críticos (HT-07)** — `hecho`. Flujos de roles, alta→suscripción→renovación, alerta, portal y API key con Playwright; `global-setup` reconcilia alertas, suite serializada por la cookie de refresh rotativa y correcciones de autenticación/selectores. 40 tests E2E en verde.
- **Bloque 6 — Hardening de seguridad (HT-06)** — `hecho`. CSP/HSTS estrictos en API y frontend (Swagger con CSP propia), `payload_too_large` 413, `pnpm audit:dependencies` con riesgos aceptados, `pnpm secrets:check`, Dependabot, DAST smoke (`pnpm security:dast` + test E2E) y revisión RLS; documentado en `docs/security/hardening.md`.
- **Bloque 7 — Despliegue y migración VPS (HT-08)** — `hecho`. Dockerfiles multi-stage (runtime/tools), `docker-compose.prod.yml` con Caddy/Postgres interno, pipeline GHCR + SSH (`.github/workflows/deploy.yml`), migraciones/pg-boss, smoke `pnpm smoke:deploy` + DAST, backups y guía `docs/migracion-vps.md`; validado localmente con imágenes reales y compose.

## Sprint 4 — Cierre de brechas MVP (en curso)

Validación contra `SoftLab.md` (2026-11-20). El flujo principal cumple; estos bloques cierran las brechas detectadas antes de declarar el MVP completo. Un bloque se cierra con código, tests, documentación y ClickUp actualizado antes de abrir el siguiente.

- **Bloque 0 — Registro y gobierno** — `hecho`. Matriz de cumplimiento, `todo.md`/`memory.md`, tareas de cierre en ClickUp (lista de Sprint 3; el token no permite crear listas) y HU-16 (CSV) fuera del alcance del MVP.
- **Bloque 1 — Solicitudes de renovación** — `hecho`. `PATCH /renewal-requests/{id}` (asignar responsable / pasar a “en progreso”) y `POST /renewal-requests/{id}/resolve` (`renovada` exige periodo confirmado; `no_renovada`/`otra`), UI con acciones y diálogo de resolución, cierre de la tarea vinculada y resolución automática al renovar, no renovar o cancelar. OpenAPI sin `pending`; unit 701, API DB 7, integración 43 + 2 nuevas, frontend 66 y build en verde.
- **Bloque 2 — Ficha de cliente** — `hecho`. `GET /clients/assignable-owners` para admin/operator, selector de responsable interno en alta y edición, y paneles de suscripciones, tareas y solicitudes dentro de la ficha. OpenAPI y tests de API/frontend en verde.
- **Bloque 3 — Suscripciones y tareas** — `hecho`. Alta de suscripción con referencia contractual, responsable, condiciones, costo de proveedor (admin), notas, renovable y visibilidad en portal; tarjeta de configuración editable en el detalle con motivo obligatorio al cambiar costo; filtros de tareas por cliente y suscripción. Typecheck, lint, tests (frontend 66), OpenAPI y build en verde.
- **Bloque 4 — Alertas** — `pendiente`. Plantilla de correo editable si HU-13 sigue siendo vinculante; decisión sobre reglas por servicio.
- **Bloque 5 — Despliegue real** — `pendiente`. VPS/DNS/GHCR/secretos, despliegue real, migraciones, smoke y backup para cerrar HT-08.
- **Bloque 6 — Opcional CSV (HU-16)** — `pendiente`. Solo si el PO decide incluirlo; por defecto queda fuera del MVP.

## Pendiente

- **Clientes (notas/actividad)** — `pendiente`. Subrecursos `/notes` y `/activity` y portal con datos. El CRUD base (HU-03) y los contactos (HU-04) ya están hechos.
- **Suscripciones** — `hecho` (HU-06.1/06.2/07 + HU-09.2). Dominio (`LocalDate`, ciclo, máquina de estados, periodo inmutable), API `GET/POST /api/v1/subscriptions`, `GET/PATCH /{id}`, `/{id}/activate`, `/{id}/cancel` (admin), `/{id}/renew`, `/{id}/start-renewal`, `/{id}/not-renewed`, `/{id}/correct-expiration`, `GET /{id}/periods`, `PATCH /{id}/periods/{periodId}`; idempotencia, versión optimista, `?productId`, RBAC; web `/subscriptions*` con historial, acciones de renovación/no renovación/corrección y pago manual por periodo. Tests de integración RN-03/RN-04/RN-06/RN-07 ejecutados.
- **Solicitudes y tareas** — `en curso`. Tareas de renovación `hecho` (API, automatización y `/tasks`); solicitudes: lista read-only `/api/v1/renewal-requests` y pantalla `/renewal-requests` hechas como enabler del dashboard; CRUD/resolución y portal siguen pendientes.
- **Alertas y worker** — `hecho` (HU-11 y HU-13). Motor en línea, tareas automáticas, reconcile, worker pg-boss, dispatch/backoff, expiración, limpieza, adaptadores Resend/log, API `/notifications`, bandeja y reglas `/api/v1/alert-rules` + `/admin/alert-rules`. Tests RN-08/RN-09/RN-10 cubiertos; T-RN08-02 concurrente queda en cierre/CI.
- **Dashboard y portal** — dashboard `hecho` (HU-12): KPIs y actividad en `/dashboard`. Portal `hecho` (HU-14): `/api/v1/portal/*`, `/portal` con suscripciones, detalle, historial, solicitud de renovación, estado de solicitudes y contacto; aislamiento por cliente, tarea `review_renewal_request` y notificaciones al equipo. RN-05/RN-11.
- **Integraciones** — `pendiente`. Manifest, API keys hasheadas, scopes, alcance de clientes y rate limit. `/api/v1/integrations`. Pantallas `/admin/integrations`. RN-12.
- **Settings** — `pendiente`. `GET /api/v1/settings` y `PATCH /api/v1/settings`. Pantalla `/admin/settings`.
- **Pruebas de contrato** — `pendiente`. Tests `T-RNxx` que falten, suite RLS parametrizada y deriva del OpenAPI (redocly / zod-to-openapi) según [`docs/testing-strategy.md`](docs/testing-strategy.md).

## No bloqueante

- **ClickUp** — `hecho` (2026-11-20). Cierre autorizado por el PO: Sprint 0/1 completos; Sprint 2 9/9 en `complete`; Sprint 3 10/10 en `complete` (HU-14/14.1/14.2, HU-15/15.1/15.2 y HT-06–HT-09). Se creó el Sprint 4 “Cierre de brechas MVP” con los bloques pendientes. HU-16 (export CSV) sigue en Backlog, no está implementada y no está en `SoftLab.md`: queda fuera del MVP salvo decisión posterior del PO. W-01–W-04 fuera del MVP. Resultado en `memory.md`.
