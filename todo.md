# Todo — FabSoft

Backlog de construcción. Un corte a la vez. Estados: `hecho`, `en curso`, `pendiente`.

Al cerrar un corte: cambiar su estado aquí y añadir una línea en la bitácora de [`memory.md`](memory.md). Cada ítem dice el resultado observable. El diseño está en `docs/`; no se amplía el alcance desde esta lista.

El siguiente corte de producto es clientes. No abrir suscripciones antes de cerrarlo.

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

## Pendiente

- **Clientes (notas/actividad)** — `pendiente`. Subrecursos `/notes` y `/activity` y portal con datos. El CRUD base (HU-03) y los contactos (HU-04) ya están hechos.
- **Suscripciones** — `hecho` (HU-06.1/06.2/07). Dominio (`LocalDate`, ciclo, máquina de estados, periodo inmutable), API `GET/POST /api/v1/subscriptions`, `GET/PATCH /{id}`, `/{id}/activate`, `/{id}/cancel` (admin), `/{id}/renew`, `GET /{id}/periods`; idempotencia, versión optimista, `?productId`, RBAC; web `/subscriptions*` con historial de periodos y acción Renovar. Faltan las acciones de Sprint 2 (`start-renewal`, `not-renewed`, `correct-expiration`), pago manual y tests de integración RN-04…RN-07.
- **Solicitudes y tareas** — `pendiente`. Crear y resolver solicitudes; tareas de renovación asignables. `/api/v1/renewal-requests` y `/api/v1/renewal-tasks`. Pantallas `/renewal-requests` y `/tasks`.
- **Alertas y worker** — `pendiente`. Reglas D30, D15, D7, D1, D0 y POST1; notificaciones in-app y correo. Proceso worker pg-boss (ADR-005). `/api/v1/notifications`, `/api/v1/alert-rules`. Pantallas `/notifications` y `/admin/alert-rules`. Tests RN-08…RN-10.
- **Dashboard y portal** — `pendiente`. KPIs y actividad en `/dashboard` (`/api/v1/dashboard/summary` y `/activity`). Portal con suscripciones, solicitud de renovación y contacto (`/api/v1/portal/*`, pantallas bajo `/portal`). RN-11.
- **Integraciones** — `pendiente`. Manifest, API keys hasheadas, scopes, alcance de clientes y rate limit. `/api/v1/integrations`. Pantallas `/admin/integrations`. RN-12.
- **Settings** — `pendiente`. `GET /api/v1/settings` y `PATCH /api/v1/settings`. Pantalla `/admin/settings`.
- **Pruebas de contrato** — `pendiente`. Tests `T-RNxx` que falten, suite RLS parametrizada y deriva del OpenAPI (redocly / zod-to-openapi) según [`docs/testing-strategy.md`](docs/testing-strategy.md).

## No bloqueante

- **ClickUp** — `pendiente`. Cruzar la lista `1600300000011695` del workspace `1600300000002171` cuando una cuenta miembro reconecte el MCP. Anotar el resultado en `memory.md`. No copia tareas ni detiene los cortes de arriba.
