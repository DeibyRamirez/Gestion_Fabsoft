# Memoria de construcción — FabSoft

Registro vivo del estado del sistema. `docs/` es el diseño; este archivo dice qué ya está construido, qué está especificado y todavía no existe, y qué se hizo en cada corte. No reescribe requisitos.

Actualizar al cerrar un corte, no en cada archivo. Añadir una línea a la bitácora y mover el ítem en [`todo.md`](todo.md). Sin secretos, tokens, contraseñas ni cadenas de conexión.

## Cómo usarlo

1. Leer este archivo y [`todo.md`](todo.md) antes de cambiar código.
2. Si [`fuentes/`](fuentes/) contradice [`docs/`](docs/), prevalece `docs/` (decisiones en ADR).
3. [`qa/diagnostico-inicial.md`](qa/diagnostico-inicial.md) (2026-11-01) describe un repo vacío. No usarlo como estado.
4. [`contexto/`](contexto/) es una copia de la especificación. El trabajo vivo está en la raíz: `docs/`, `backend/`, `frontend/`.
5. No inventar módulos ni cambiar stack o arquitectura. Lo no cubierto se anota como pregunta, no se implementa.

## Producto

FabSoft centraliza clientes, productos, licencias/suscripciones y renovaciones para que ninguna renovación se pierda por falta de seguimiento. Incluye alertas, historial de periodos, portal de consulta y API REST. Detalle: [`docs/project-context.md`](docs/project-context.md).

Usuarios: internos `admin` y `operator` (2–5); `client`, solo el portal de su organización; integraciones con API key `fsk_…` (scopes y alcance `all` / `own`); actor `system`, solo autenticación y worker, nunca una petición HTTP.

Fuera del MVP: pagos en línea/Wompi, GraphQL, microservicios, app móvil, websockets, Supabase Auth/Storage/Realtime/Data API, multimoneda, borrado físico, archivos de contratos, webhooks, facturación electrónica.

## Decisiones cerradas

No reabrir. Resumen en [`docs/project-context.md`](docs/project-context.md) §4; texto en [`docs/adr/`](docs/adr/).

1. Monolito modular: `domain` / `application` / `infrastructure` / `interfaces`, composition root.
2. Express 5 (API + worker) y Next.js 16 separados; monorepo pnpm. ADR-008.
3. Supabase solo como PostgreSQL gestionado + RLS; el mismo SQL corre en PostgreSQL 16. ADR-008.
4. REST `/api/v1`, OpenAPI 3.1, problem+json. ADR-002.
5. JWT EdDSA para personas; API keys hasheadas para integraciones. ADR-001.
6. RLS forzado; contexto `app.*` por transacción; rol `fabsoft_app` sin BYPASSRLS. ADR-004.
7. Correo solo desde el worker pg-boss. ADR-005.
8. Singletons solo de infraestructura sin estado de usuario. ADR-006.
9. Repositorio por caso de uso, no CRUD genérico. ADR-007.
10. Vigencia, pago y seguimiento son tres dimensiones. Fechas de negocio en `America/Bogota`, fin inclusivo. Moneda COP.

## Existe

- Monorepo pnpm (Node 22, pnpm 9): `backend/`, `frontend/`, `packages/shared`, `packages/config`. Docker Compose para PostgreSQL 16. Migraciones dbmate `0001`–`0005` (esquema completo del MVP, RLS, endurecimiento, vistas de integración, funciones de auth). Seed y alta de admin. Generación de claves JWT.
- Capas y composition root en `backend/src/`. Reglas de import y [`backend/tests/architecture/layers.test.ts`](backend/tests/architecture/layers.test.ts).
- Health: `GET /api/v1/health` y `GET /api/v1/health/ready`.
- Auth humana: `POST /api/v1/auth/login`, `refresh`, `logout`, `change-password`; `GET /api/v1/auth/me`. JWT (`jose`), contraseñas (`argon2`), refresh en cookie. Pantallas `/login` y `/change-password`. Token de acceso en memoria del navegador.
- Usuarios admin: `GET/POST /api/v1/users`, `GET/PATCH /api/v1/users/{id}`, `POST /api/v1/users/{id}/reset-password`. Pantalla `/admin/users`.
- Idempotencia HTTP y contexto RLS por transacción. Escritor de auditoría Postgres presente; no hay API de lectura.
- Frontend: grupos `(auth)`, `(internal)`, `(portal)`, `RoleGate`. `/dashboard` solo muestra el estado del API. `/portal` es un marcador (“pendiente”).
- CI en [`.github/workflows/ci.yml`](.github/workflows/ci.yml): lint, typecheck, tests, build y job de migraciones/RLS.
- Contrato de todo el MVP escrito en [`docs/api/openapi.yaml`](docs/api/openapi.yaml). El servidor solo expone health, auth y users.
- Tests de auth, health, idempotencia, capas, contrato de repositorio y endurecimiento de seguridad.

## Especificado y ausente

El esquema SQL y el OpenAPI ya describen estos módulos. No hay casos de uso, rutas ni pantallas de datos.

- Clientes: alta, edición, archivo/reactivación, contactos, notas, NIT único, actividad.
- Productos: catálogo `third_party`, `own`, `recurring_service`.
- Suscripciones: alta, activación, renovación con periodo inmutable, no renovada, cancelación, corrección de vencimiento, pago manual. Dominio (`LocalDate`, `Money`, máquina de estados) no existe; `backend/src/domain/` solo tiene usuarios y errores. RN-01…RN-07.
- Solicitudes y tareas de renovación.
- Alertas D30/D15/D7/D1/D0/POST1 y worker pg-boss (Resend). [`backend/src/interfaces/worker/README.md`](backend/src/interfaces/worker/README.md) lo deja fuera del corte actual. No están `pg-boss`, `pino`, `resend` ni `date-fns`.
- Dashboard de KPIs y portal con datos (RN-11).
- Integraciones y API keys (RN-12). Settings.
- Lectura de auditoría (RN-13). RN-01…RN-16 no tienen tests `T-RNxx`.
- Frontend de datos: Tailwind 4, shadcn, TanStack Query y react-hook-form. Se introducen en el corte de clientes, no como un corte posterior. Hoy el frontend solo depende de Next y React.
- Pipeline completo de [`docs/testing-strategy.md`](docs/testing-strategy.md): deriva OpenAPI/redocly, integración de reglas de negocio y worker. [`contexto/README.md`](contexto/README.md) describe ese objetivo; el [`README.md`](README.md) de la raíz describe el corte actual.

## ClickUp

No es la fuente de avance. Workspace objetivo `1600300000002171`, lista `1600300000011695` (https://app.clickup.com/1600300000002171/v/l/li/1600300000011695). La cuenta conectada al MCP, `deibyfastservice@gmail.com`, solo ve el workspace `90171070498` (INGENIERIA, NEGOCIOS, Universidad) y no puede leer FabSoft. No bloquea el código. Cuando una cuenta miembro reconecte el MCP, anotar aquí lo que haya en esa lista. No copiar tareas a ClickUp hasta entonces.

## Bitácora

- 2026-11-02 — Diagnóstico y registro inicial. Auth, usuarios, health, idempotencia, migraciones del modelo y CI básico están operativos. El resto del MVP está especificado en `docs/` y OpenAPI, sin casos de uso. ClickUp FabSoft no es accesible con la cuenta conectada; el avance queda en este archivo y en `todo.md`.
