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
- Productos (HU-05 backend): `GET/POST /api/v1/products`, `GET/PATCH /api/v1/products/{id}`. Catálogo sin precio ni ciclo; RBAC lectura admin/operator, escritura admin; `409 duplicate_product`. Sin DELETE (RN-14). Tests unitarios, `products.db.test.ts` e integración `T-RN02-01`.
- Idempotencia HTTP y contexto RLS por transacción. Escritor de auditoría Postgres presente; no hay API de lectura.
- Frontend: grupos `(auth)`, `(internal)`, `(portal)`, `RoleGate`. Tailwind 4 + tokens (`docs/design.md`), shadcn/ui en `src/shared/ui`, `AppShell` (nav por rol) y `PortalShell`. Pantallas estilizadas: login, cambio de contraseña, panel, admin/usuarios, portal. `/dashboard` solo muestra el estado del API. `/portal` es un marcador (“pendiente” de datos).
- CI en [`.github/workflows/ci.yml`](.github/workflows/ci.yml): lint, typecheck, tests, build y job de migraciones/RLS.
- Contrato de todo el MVP escrito en [`docs/api/openapi.yaml`](docs/api/openapi.yaml). El servidor expone health, auth, users y products (catálogo).
- Tests de auth, health, idempotencia, capas, contrato de repositorio y endurecimiento de seguridad.

## Especificado y ausente

El esquema SQL y el OpenAPI ya describen estos módulos. No hay casos de uso, rutas ni pantallas de datos.

- Clientes: alta, edición, archivo/reactivación, contactos, notas, NIT único, actividad.
- Suscripciones: alta, activación, renovación con periodo inmutable, no renovada, cancelación, corrección de vencimiento, pago manual. Dominio (`LocalDate`, `Money`, máquina de estados) no existe; `backend/src/domain/` solo tiene usuarios y errores. RN-01…RN-07.
- Solicitudes y tareas de renovación.
- Alertas D30/D15/D7/D1/D0/POST1 y worker pg-boss (Resend). [`backend/src/interfaces/worker/README.md`](backend/src/interfaces/worker/README.md) lo deja fuera del corte actual. No están `pg-boss`, `pino`, `resend` ni `date-fns`.
- Dashboard de KPIs y portal con datos (RN-11).
- Integraciones y API keys (RN-12). Settings.
- Lectura de auditoría (RN-13). RN-01…RN-16 no tienen tests `T-RNxx`.
- Frontend de datos: TanStack Query y react-hook-form (corte clientes). Tailwind 4 y shadcn/ui ya están en HU-02.
- Pipeline completo de [`docs/testing-strategy.md`](docs/testing-strategy.md): deriva OpenAPI/redocly, integración de reglas de negocio y worker. [`contexto/README.md`](contexto/README.md) describe ese objetivo; el [`README.md`](README.md) de la raíz describe el corte actual.

## ClickUp

No es la fuente de avance. Workspace objetivo `1600300000002171`, lista `1600300000011695` (https://app.clickup.com/1600300000002171/v/l/li/1600300000011695). La cuenta conectada al MCP, `deibyfastservice@gmail.com`, solo ve el workspace `90171070498` (INGENIERIA, NEGOCIOS, Universidad) y no puede leer FabSoft. No bloquea el código. Cuando una cuenta miembro reconecte el MCP, anotar aquí lo que haya en esa lista. No copiar tareas a ClickUp hasta entonces.

## Bitácora

- 2026-11-02 — Diagnóstico y registro inicial. Auth, usuarios, health, idempotencia, migraciones del modelo y CI básico están operativos. El resto del MVP está especificado en `docs/` y OpenAPI, sin casos de uso. ClickUp FabSoft no es accesible con la cuenta conectada; el avance queda en este archivo y en `todo.md`.
- 2026-11-02 — HU-02 sistema de diseño base. Tailwind 4, tokens, shadcn/ui, shells con navegación por rol y estilos en pantallas auth/internas/portal; tests de componentes base en verde.
- 2026-11-03 — Variables de entorno por capa: `backend/.env.example` y `frontend/.env.example`; scripts backend y dbmate cargan `backend/.env`; README y `docs/deployment.md` actualizados.
- 2026-11-03 — Arranque monorepo: `predev` compila `@fabsoft/shared` en backend/frontend; `with-env.mjs` invoca `dbmate.cmd` en Windows; README exige Node 22 y comandos desde la raíz.
- 2026-11-04 — HU-05 backend productos. API `GET/POST/PATCH /api/v1/products`, dominio/aplicación/infra PG, Zod en `@fabsoft/shared`, tests unitarios + `products.db.test.ts` + `T-RN02-01`; e2e products sigue en fixme.
- 2026-11-04 — HU-05 seguimiento QA. Contratos AJV (`product-schema`, `additionalProperties`), mapa `STATUS_BY_CODE`, `T-HU05-04` desactivar, `T-RN14-01` DELETE en `app.products`; sin cambios en migraciones.
- 2026-11-08 — Sprint1 Foundation F0. Rol `fabsoft_migrator` (LOGIN, no superusuario) vía harness de aprovisionamiento; URLs provision/migrate/runtime; seed fail-closed; pruebas fresh+upgrade y runtime en CI.
- 2026-11-13 — PR #15 ronda 3 QA/Seguridad. Seed con `fabsoft_seed_writer` + RLS (sin `SEED_ALLOW_HARNESS_SUPERUSER`); denylist/URL fail-closed; reconcile migrator siempre; harness `finally`; mapa `docs/qa-f0-test-map.md`.
- 2026-11-13 — Ampliación owner: `0002`–`0005` por migrator en BD efímera (`migrator-historical-elevation.ts`: stub roles, elevación/teardown, T-F0-11/12).
- 2026-11-13 — CI 42501 en `0003`: roles destino de `ALTER OWNER` necesitan `CREATE` en schema `app` (harness `grantHistoricalRoleSchemaCreate`); dbmate por archivo + reparar grants; teardown `REVOKE ADMIN … CASCADE`.
- 2026-11-13 — e2e seed: cumplir WITH CHECK de RLS (sin insertar `archived` en clients; suscripciones vía active + update; notas y renovaciones con `app.*` coherente al autor).
- 2026-11-13 — Ronda 4 QA F0: revoke CREATE efímero en `app`, CTE membresías migrator, guard migrator URL, upgrade develop reassign+ACL, suites `roles`/`rls-effective`/`no-owner-assertions`, `test:security` sin paralelo de archivos.
- 2026-11-13 — Ronda 5 QA F0: reparación REVOKE/GRANT post ALTER OWNER, `db:reconcile:owner-to-migrator`, ACL aclexplode estricto en foundation, `assert_rls_everywhere` en db:migrate, `definer-privileges.test.ts`.
- 2026-11-13 — Ronda 6 QA F0 (PR #15): seed `--reset` fail-closed + sin `session_replication_role`; defaults globales migrator sin EXECUTE a PUBLIC/app en funciones nuevas; paridad ACL attacl/defacl+firma; T-SEC-30 sin admin; matriz T-F0-05/08/09; gate prosecdef PUBLIC; `test:security` 64/64 local.
- 2026-11-13 — Ronda 7 QA F0 (PR #15): sin ACL_PARITY_IGNORE + N4; T-F0-09c RLS real + mutación políticas; T-F0-05 api/integration sin owner bypass; seed CLI guard; develop-upgrade event trigger; `test:security` 59 pass / 11 skip local.
- 2026-11-13 — Ronda 8 QA F0 (PR #15, HEAD a4ead55): gate allowlist prosecdef + repair fail-closed; T-F0-09c matriz portal/18 tablas; mutaciones rollback; owner-system + evasiones T-F0-05; T-SEC-30×3; T-F0-08b vitest en develop-upgrade (`vitest.f0-08b.mts`); CI workflow verde; `test:security` 82/82 sin skips en job db-security.
- 2026-11-13 — Ronda 9 PO (PR #15): eliminado restore COMMIT de RLS canónico → fidelidad `pg_policies` + `USING(true)` rojo; gate prosecdef todos schemas/roles efectivos + mutaciones public/worker/seed/herencia; sin GRANT EXECUTE blanket migrator/seed_writer; T-F0-05 `getOwnerPool`/re-export; seed reset otra BD; fixtures mutación autónomos.
- 2026-11-13 — Ronda 10 PO (PR #15): T-F0-05 ESLint `eslint.f0-05.js` + mutaciones lint/vitest; snapshot exacto 62 políticas app (`app-rls-policies-develop.snapshot.json`).
- 2026-11-13 — Ronda 11 PO (PR #15): T-F0-05 ampliado (db computado, import owner-system, config real + `T_F0_05_FIXTURE_LINT`); vitest scan helpers/fixtures reales; snapshot roles `array_agg(::text)`.
- 2026-11-13 — F0 audit_write (`0006`): `fabsoft_audit_definer`, sin INSERT directo en `audit_logs`, seed `--reset` conserva `alert_rules`/`app_settings`, `TEST_DATABASE_MIGRATION_URL`→migrator en harness, tests audit/seed/idempotencia (PR contra develop).
- 2026-11-13 — Ítem 6 PO (PR #16, HEAD 6e04046): gate `assertNoNoinheritSetPathToSensitive` + allowlist `seed_writer→fabsoft_app`; mutaciones SET→`fabsoft_audit_definer`/`fabsoft_auth_definer` en rojo; CI run 43507696836 verde; db-security 118 passed / 0 failed / 0 skipped.
