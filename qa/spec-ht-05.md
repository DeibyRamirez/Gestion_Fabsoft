# HT-05 · Infraestructura de pruebas — especificación para Desarrollo

> Primera tarea del Sprint 1 (16–27 nov 2026); bloquea HU-03…HU-08 (`qa/plan-sprint-1.md` §0.2). Basada en `docs/testing-strategy.md` y en el `.github/workflows/ci.yml` actual (jobs `lint-typecheck`, `unit tests`, `build`, `db-security`, `openapi-lint`). No cambia stack ni arquitectura.

**Historia:** Como QA quiero una infraestructura de pruebas de integración, API, cobertura, E2E smoke y rendimiento ejecutándose en CI para que cada HU del sprint pueda demostrar sus criterios con tests automáticos.

## 1. Estado de partida (main @ 65f8ad7)
- `backend/vitest.config.ts` solo define `include`; sin coverage.
- Scripts backend: `test` (excluye security), `test:unit`, `test:security`, `db:migrate`, `db:seed`.
- Existen `tests/api`, `tests/architecture`, `tests/security`, `tests/fixtures/memory-infra.ts`. **No existen** `tests/integration/`, `tests/contracts/`, `tests/perf/`, `factories.ts`, Playwright.
- `docker-compose.yml` ya tiene `db-test` en el puerto 54329.
- Los tests de `tests/api` actuales usan fakes en memoria; los nuevos de API corren contra Postgres.

## 2. Estructura
```
backend/tests/
  helpers/
    db.ts              # pools owner/app, resetDatabase(), withAppContext()
    clock.ts           # FixedClock('2026-11-01T13:00:00Z')
    app.ts             # buildTestApp() con composition root real + Pg
    openapi.ts         # expectMatchesOperation(res, operationId)
  fixtures/
    memory-infra.ts    # (existente)
    factories.ts       # fábricas con semilla fija
  integration/
    clients/  products/  subscriptions/  audit/  db/
    smoke.integration.test.ts
  api/                 # existentes + nuevos contra Postgres (*.db.test.ts)
  contracts/
  perf/
    clients-search.perf.test.ts
  global-setup.ts      # verifica migraciones aplicadas y TZ=UTC
e2e/                   # raíz del monorepo
  playwright.config.ts
  smoke/ auth.spec.ts clients.spec.ts contacts.spec.ts products.spec.ts subscriptions.spec.ts renew.spec.ts audit.spec.ts
```

## 3. Base de datos de pruebas y `resetDatabase()`
- Local: `docker compose up -d db-test`; `TEST_DATABASE_MIGRATION_URL` (rol propietario) y `TEST_DATABASE_URL` (rol `fabsoft_app`, sin BYPASSRLS). CI: service container `postgres:16`.
- Migraciones: las **mismas** de producción (`pnpm db:migrate` con `DATABASE_MIGRATION_URL=$TEST_DATABASE_MIGRATION_URL`) + `LOGIN` para `fabsoft_app` (reutilizar `scripts/dev-roles.ts`).
- `resetDatabase()` (`helpers/db.ts`):
  - conecta con el **rol propietario**; `TRUNCATE` en una sola sentencia de todas las tablas de `app` (lista leída de `pg_tables where schemaname='app'` excepto `schema_migrations`) `RESTART IDENTITY CASCADE`;
  - no dispara `tg_prevent_delete`; `fabsoft_app` no tiene `TRUNCATE`;
  - se niega a correr si la URL no apunta a una BD cuyo nombre termina en `_test` (protección).
- Las consultas de la aplicación en tests usan siempre `fabsoft_app` con contexto RLS (`withAppContext`), nunca el propietario.
- `withAppContext` / pool de app: al conectar verifica `session_user='fabsoft_app'` y en `pg_roles` que no sea superusuario ni tenga `BYPASSRLS` (`assertFabsoftAppSession`).
- `testEnvSource` (`helpers/env.ts`): fuerza `DATABASE_URL=TEST_DATABASE_URL` (misma protección `_test`); la API de test no usa el `DATABASE_URL` de dev.
- Los archivos de `integration/` y `api/*.db.test.ts` corren en serie (`--no-file-parallelism`) para que el truncado no interfiera.
- Sin `REQUIRE_DB_TESTS=1` y sin BD, se saltan con aviso; en CI `REQUIRE_DB_TESTS=1` hace que fallen.

## 4. Factories (`tests/fixtures/factories.ts`)
- `@faker-js/faker` con `faker.seed(42)` por defecto, reiniciado en cada `beforeEach`; `createFactories({ seed })` permite otra semilla (perf usa 42).
- Insertan con el rol propietario (datos de preparación), devuelven el registro tipado y aceptan `overrides` parciales.
- Fábricas mínimas:
  - `user({ role: 'admin'|'operator'|'client', clientId? })` + helpers `adminUser()`, `operatorUser()`, `clientUser(client)` y `tokenFor(user)` (JWT válido con claves de test).
  - `client({ status?, document? })` — NIT válido con DV correcto, documento normalizado (solo dígitos, sin DV).
  - `contact(client, { isPrimary?, archived? })`.
  - `product({ type?, status? })` — sin precio ni ciclo.
  - `subscription(client, product, { status='pending_activation', billingCycle='monthly', startDate, price })` — crea el periodo 1.
  - `period(subscription, { startDate, endDate, priceAmount, paymentStatus })` — contiguo al último.
  - `renewalRequest(subscription, { status='pending_review' })`.
  - `bulkClients(n)` — inserción por lotes (`COPY` o `INSERT … SELECT`) para perf.
- Determinismo: misma semilla ⇒ mismos datos (test de las propias factories).

## 5. Scripts pnpm
Backend (`backend/package.json`):
| Script | Comando |
|---|---|
| `test` | (existente) unit + api en memoria |
| `test:integration` | `REQUIRE_DB_TESTS=1 vitest run --project integration --no-file-parallelism` |
| `test:api` | `REQUIRE_DB_TESTS=1 vitest run --project api-db --no-file-parallelism` |
| `test:coverage` | `vitest run --coverage --project unit` |
| `test:perf` | `REQUIRE_DB_TESTS=1 vitest run --project perf` |
| `db:migrate:test` | `dbmate` con `TEST_DATABASE_MIGRATION_URL` |

Raíz: `test:integration`, `test:api`, `test:coverage`, `test:perf` delegan con `pnpm --filter @fabsoft/backend …`; `test:e2e` = `playwright test -c e2e/playwright.config.ts`.
Todos los scripts de test fijan `TZ=UTC` (vía `cross-env` o en `vitest.config.ts`: `process.env.TZ='UTC'` + comprobación en `global-setup.ts` que falla si `new Date().getTimezoneOffset() !== 0`).

## 6. Cobertura (vitest)
```ts
// backend/vitest.config.ts (extracto)
coverage: {
  provider: 'v8',
  reporter: ['text', 'json-summary', 'lcov'],
  include: ['src/domain/**', 'src/application/**'],
  exclude: ['**/*.test.ts', '**/ports.ts'],
  thresholds: {
    'src/domain/subscriptions/**':      { lines: 90, branches: 90, functions: 90, statements: 90 },
    'src/application/subscriptions/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
},
```
- Dependencia `@vitest/coverage-v8` con la misma versión que `vitest`.
- **Protección contra ruta vacía:** `scripts/check-coverage-paths.ts` lee `coverage/coverage-summary.json` y falla si alguna ruta con umbral no aparece con ≥1 archivo medido. Hasta que HU-06 cree `src/domain/subscriptions/`, el script se activa con la variable `COVERAGE_REQUIRED_PATHS` (vacía en HT-05; HU-06 la rellena) — así HT-05 no queda roja por diseño y HU-06 no puede pasar sin código medido.
- El objetivo global de testing-strategy (≥90 % domain/application, ≥80 % backend) se reporta sin bloquear en S1.

## 7. Playwright smoke
- `@playwright/test`, solo Chromium, `retries: 1` en CI, `trace: 'on-first-retry'`, artefacto `playwright-report/`.
- Contra **build local**: `webServer` levanta `pnpm --filter @fabsoft/backend start` (API, build) y `pnpm --filter @fabsoft/frontend start` (Next build) apuntando a la BD de test migrada + `db:seed` (`docs/seed-data.md`).
- `smoke/auth.spec.ts` (real en HT-05): login admin ⇒ `/dashboard`; login operador ⇒ intentar `/admin/users` redirige a su inicio.
- Un esqueleto por HU con `test.fixme` y el flujo descrito, que cada HU completa: `clients` (HU-03), `contacts` (HU-04), `products` (HU-05), `subscriptions` (HU-06), `renew` (HU-07), `audit` (HU-08).
- Sin snapshots visuales; selectores por rol/label accesible.

## 8. CI — jobs nuevos (`.github/workflows/ci.yml`)
Todos: `ubuntu-latest`, `pnpm/action-setup@v4`, `actions/setup-node@v4` con `.nvmrc`, `pnpm install --frozen-lockfile`, `env: TZ: UTC`. Los jobs existentes no cambian salvo `unit tests` (añade coverage).

Bloque de servicio común (jobs HT-05 nuevos: `integration-api`, `e2e-smoke`, `perf-smoke`): contenedor `postgres:16` con `POSTGRES_USER=fabsoft_owner`, `POSTGRES_DB=fabsoft_test`, `POSTGRES_HOST_AUTH_METHOD=trust`; paso `backend/scripts/export-ci-database-url.sh` exporta URLs sin contraseña a `GITHUB_ENV`. El job `db-security` se mantiene igual que en `main` (`POSTGRES_PASSWORD: ci_owner` y URLs en `env`).
```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: fabsoft_owner
      POSTGRES_DB: fabsoft_test
      POSTGRES_HOST_AUTH_METHOD: trust
    ports: ['5432:5432']
    options: >-
      --health-cmd "pg_isready -U fabsoft_owner -d fabsoft_test"
      --health-interval 5s --health-timeout 5s --health-retries 10
```
| Job | Pasos | Bloqueante |
|---|---|---|
| `unit tests` (modificado) | `pnpm --filter @fabsoft/shared build` → `pnpm test` → `pnpm test:coverage` → `check-coverage-paths` → subir `coverage/` | Sí |
| `integration-api` | service postgres → `pnpm db:migrate` → rol `fabsoft_app` LOGIN → `pnpm test:integration` → `pnpm test:api` | Sí |
| `e2e-smoke` | service postgres → migrar + seed → `pnpm build` → `npx playwright install --with-deps chromium` → `pnpm test:e2e` → subir `playwright-report/` | Sí (solo `auth.spec.ts` activo; el resto `fixme`) |
| `perf-smoke` | service postgres → migrar → `pnpm test:perf` → subir `perf-results.json` | **No**: `continue-on-error: true` hasta el 2026-11-23 (1 semana desde el 16-nov); luego se quita |

Secretos: claves JWT de test generadas en el job (`scripts/generate-jwt-keys.ts`) a un directorio temporal; nada en el repo.

## 9. Perf-smoke (`tests/perf/clients-search.perf.test.ts`)
- Dataset: `bulkClients(10_000)` con semilla 42 (30 % nombres con tilde, 5 % archivados, 2 contactos c/u).
- Consultas: 50 términos fijos (prefijo, subcadena, documento exacto y parcial, sin resultados), `pageSize=20`, vía supertest contra `buildTestApp()` con rol `fabsoft_app` y RLS.
- Calentamiento: 2 rondas descartadas; luego **200 peticiones** medidas con `performance.now()`.
- Criterio: **p95 < 500 ms**; también p50, p99, max.
- Salida `backend/perf-results.json`:
```json
{ "test": "clients-search", "commit": "<sha>", "dataset": { "clients": 10000, "seed": 42 },
  "requests": 200, "warmupRounds": 2, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0, "max_ms": 0,
  "threshold_p95_ms": 500, "passed": true, "runner": "ubuntu-latest", "pg": "16" }
```
- En HT-05 el endpoint de búsqueda aún no existe: el test se entrega con el dataset, el arnés de medición y el JSON, y la petición marcada `it.todo` hasta HU-03 (el arnés se valida midiendo `GET /api/v1/health/ready`).

## 10. Criterios de aceptación (Gherkin)
```gherkin
Escenario: Base de datos de integración reproducible
  Dado un Postgres 16 con las migraciones de backend/migrations aplicadas
  Cuando ejecuto pnpm test:integration
  Entonces cada test empieza con las tablas de app vacías tras resetDatabase()
  Y las consultas de la aplicación se ejecutan con el rol fabsoft_app sujeto a RLS

Escenario: Protección de resetDatabase
  Dado una URL de base de datos cuyo nombre no termina en _test
  Cuando se invoca resetDatabase()
  Entonces lanza un error y no trunca ninguna tabla

Escenario: Factories deterministas
  Dado la semilla 42
  Cuando genero dos veces el mismo conjunto de clientes, contactos, productos, suscripciones, periodos, solicitudes y usuarios por rol
  Entonces ambos conjuntos son idénticos

Escenario: Zona horaria
  Cuando corre cualquier suite de tests
  Entonces el proceso tiene TZ=UTC y falla si no es así

Escenario: Umbral de cobertura del dominio de suscripciones
  Dado que src/domain/subscriptions o src/application/subscriptions tienen menos de 90 % de líneas, ramas, funciones o sentencias
  Cuando corre el job unit tests
  Entonces el job falla

Escenario: Umbral sobre ruta vacía
  Dado una ruta declarada en COVERAGE_REQUIRED_PATHS sin archivos medidos
  Cuando corre check-coverage-paths
  Entonces el job falla indicando la ruta

Escenario: Smoke E2E de login
  Dado el build local de API y web contra la base de test con seed
  Cuando corre pnpm test:e2e
  Entonces el admin inicia sesión y llega a /dashboard
  Y el operador que abre /admin/users es redirigido a su inicio

Escenario: Jobs de CI
  Dado un pull request
  Cuando corre el workflow CI
  Entonces se ejecutan integration-api y e2e-smoke contra un service container postgres:16
  Y perf-smoke publica perf-results.json como artefacto sin bloquear el PR durante la primera semana
```

## 11. Definición de hecho
- [ ] Estructura de §2 creada; `helpers/db.ts` con `resetDatabase()` y su protección; `factories.ts` con todas las fábricas de §4 y test de determinismo.
- [ ] Scripts de §5 en backend y raíz; `TZ=UTC` comprobado en `global-setup.ts`.
- [ ] `vitest.config.ts` con coverage y umbrales de §6; `@vitest/coverage-v8` instalado; `check-coverage-paths` con test propio.
- [ ] Playwright configurado; `auth.spec.ts` verde; 6 esqueletos `fixme` por HU.
- [ ] Jobs `integration-api`, `e2e-smoke`, `perf-smoke` y `unit tests` modificado en `ci.yml`; ejecución verde en el PR (perf puede estar en rojo informativo) con artefactos `coverage/`, `playwright-report/`, `perf-results.json`.
- [ ] Al menos un test real por nivel: `smoke.integration.test.ts` (inserta y lee con RLS), un `*.db.test.ts` de API (`GET /health/ready`), un test de contrato (`expectMatchesOperation` sobre health).
- [ ] `docs/testing-strategy.md` §2 y §8 actualizados con los nombres reales de scripts y jobs; `README.md` explica cómo correr cada suite en local.
- [ ] Branch protection: `integration-api`, `e2e-smoke` y `unit tests` como checks requeridos (lo configura el dueño del repo).
- [ ] Revisión de QA aprobada; sin secretos en el repo; lint, typecheck y format:check verdes.
