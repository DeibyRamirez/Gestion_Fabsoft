# Todo — FabSoft

Backlog de construcción. Un corte a la vez. Estados: `hecho`, `en curso`, `pendiente`.

Al cerrar un corte: cambiar su estado aquí y añadir una línea en la bitácora de [`memory.md`](memory.md). Cada ítem dice el resultado observable. El diseño está en `docs/`; no se amplía el alcance desde esta lista.

El siguiente corte de producto es clientes. No abrir suscripciones antes de cerrarlo.

## Hecho

- **Cimientos** — `hecho`. Monorepo pnpm, PostgreSQL 16 en Docker, migraciones `0001`–`0005`, seed, alta de admin y generación de claves JWT. CI: lint, typecheck, tests, build y job de migraciones/RLS.
- **Health** — `hecho`. `GET /api/v1/health` y `GET /api/v1/health/ready`. `/dashboard` muestra solo el estado del API.
- **Auth** — `hecho`. `POST /api/v1/auth/login`, `refresh`, `logout`, `change-password` y `GET /api/v1/auth/me`. Pantallas `/login` y `/change-password`. Sesión con JWT y refresh en cookie.
- **Usuarios** — `hecho`. `GET/POST /api/v1/users`, `GET/PATCH /api/v1/users/{id}`, `POST /api/v1/users/{id}/reset-password`. Pantalla `/admin/users`, solo admin.
- **Idempotencia y RLS** — `hecho`. Middleware de idempotencia HTTP y contexto RLS por transacción en la API.

## Pendiente

- **Clientes** — `pendiente`. Siguiente corte. Alta, edición, archivo, reactivación, contactos, notas, NIT único y actividad. API ya descrita en `docs/api/openapi.yaml` (`/api/v1/clients` y subrecursos). Pantallas `/clients`, `/clients/new` y `/clients/[clientId]`. Este corte incorpora Tailwind 4, shadcn, TanStack Query y formularios con Zod de `@fabsoft/shared` ([`docs/stack.md`](docs/stack.md), [`docs/design.md`](docs/design.md)).
- **Productos** — `pendiente`. Catálogo `third_party`, `own`, `recurring_service`, activo/inactivo. `GET/POST /api/v1/products` y `GET/PATCH /api/v1/products/{id}`. Pantalla `/admin/products`.
- **Suscripciones** — `pendiente`. Alta, activación, renovación con periodo inmutable, no renovada, cancelación, corrección de vencimiento y pago manual. Rutas `/api/v1/subscriptions` y acciones del OpenAPI. Pantallas `/subscriptions`, `/subscriptions/new` y `/subscriptions/[subscriptionId]`. Dominio y tests de RN-01…RN-07, no solo los triggers SQL.
- **Solicitudes y tareas** — `pendiente`. Crear y resolver solicitudes; tareas de renovación asignables. `/api/v1/renewal-requests` y `/api/v1/renewal-tasks`. Pantallas `/renewal-requests` y `/tasks`.
- **Alertas y worker** — `pendiente`. Reglas D30, D15, D7, D1, D0 y POST1; notificaciones in-app y correo. Proceso worker pg-boss (ADR-005). `/api/v1/notifications`, `/api/v1/alert-rules`. Pantallas `/notifications` y `/admin/alert-rules`. Tests RN-08…RN-10.
- **Dashboard y portal** — `pendiente`. KPIs y actividad en `/dashboard` (`/api/v1/dashboard/summary` y `/activity`). Portal con suscripciones, solicitud de renovación y contacto (`/api/v1/portal/*`, pantallas bajo `/portal`). RN-11.
- **Integraciones** — `pendiente`. Manifest, API keys hasheadas, scopes, alcance de clientes y rate limit. `/api/v1/integrations`. Pantallas `/admin/integrations`. RN-12.
- **Auditoría y settings** — `pendiente`. Lectura de cambios sensibles y configuración. `GET /api/v1/audit-logs` y `/api/v1/settings`. Pantallas `/admin/audit` y `/admin/settings`. RN-13.
- **Pruebas de contrato** — `pendiente`. Tests `T-RNxx` que falten, suite RLS parametrizada y deriva del OpenAPI (redocly / zod-to-openapi) según [`docs/testing-strategy.md`](docs/testing-strategy.md).

## No bloqueante

- **ClickUp** — `pendiente`. Cruzar la lista `1600300000011695` del workspace `1600300000002171` cuando una cuenta miembro reconecte el MCP. Anotar el resultado en `memory.md`. No copia tareas ni detiene los cortes de arriba.
