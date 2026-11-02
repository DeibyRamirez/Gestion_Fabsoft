# Estrategia de pruebas — FabSoft

> Herramientas: **vitest** (unit/integración), **supertest** (HTTP), PostgreSQL 16 real en Docker para integración y seguridad, `@testing-library/react` para frontend, `@redocly/cli` para el contrato OpenAPI. Las reglas de negocio y sus tests están en `docs/business-rules.md`.

## 1. Pirámide y alcance

| Nivel | Qué prueba | Dónde | Dependencias | Velocidad |
|---|---|---|---|---|
| Unit (dominio) | Máquina de estados, cálculo de periodos/fechas, alertas (fechas y elegibilidad), dedupe keys, validación semántica de manifest | `backend/src/domain/**/*.test.ts` | Ninguna | ms |
| Unit (aplicación) | Casos de uso con *fakes* en memoria de sus puertos; autorización fina | `backend/src/application/**/*.test.ts` | Fakes, `FixedClock` | ms |
| Contrato de puertos | Misma suite para adaptador real y fake (LSP): repos, `EmailSender`, `DatabaseConnectionProvider` | `backend/tests/contracts/` | Postgres (para reales) | s |
| Integración (persistencia) | Repositorios Pg, triggers, constraints, `withRlsContext` | `backend/tests/integration/` | Postgres 16 | s |
| Seguridad / RLS | Aislamiento por cliente/integración/rol directamente en SQL y vía API | `backend/tests/security/` | Postgres 16 | s |
| API | Rutas Express: auth, validación, códigos, problem+json, idempotencia, paginación, rate limit | `backend/tests/api/` (supertest) | Postgres 16 | s |
| Worker | Jobs (`reconcile`, `dispatch`, `expire`) con `LogEmailSender` y `FakeEmailSender` que falla a demanda | `backend/tests/worker/` | Postgres 16 + pg-boss | s |
| Arquitectura | Reglas de dependencia entre capas, no importar `pool` fuera de infra, no `SystemContext` en http | `backend/tests/architecture/` | — | ms |
| Frontend | Componentes y hooks críticos | `frontend/tests/` | jsdom | ms |
| Contrato OpenAPI | Lint del spec y respuestas de la API validadas contra el spec | CI | — | s |

Objetivo de cobertura: **≥ 90 % líneas en `domain` y `application`**, ≥ 80 % global del backend. La cobertura no sustituye los tests de reglas: cada RN tiene al menos un test con su ID en el nombre (`it('T-RN04-01 conserva el periodo anterior al renovar', ...)`).

## 2. Base de datos de pruebas

- `docker compose up -d db-test` (Postgres 16, puerto 54329, `tmpfs` para velocidad).
- Antes de la suite: `dbmate --url $TEST_DATABASE_MIGRATION_URL up` (las **mismas** migraciones que producción) + asignar `LOGIN` a `fabsoft_app`.
- Cada test de integración corre dentro de una transacción del **rol propietario** que se revierte, o trunca tablas en `beforeEach` con `TRUNCATE ... CASCADE` ejecutado por el rol propietario (helper `resetDatabase()` sólo en tests). `TRUNCATE` no dispara los triggers de fila `tg_prevent_delete`, y `fabsoft_app` no tiene privilegio `TRUNCATE`.
- Las consultas de la aplicación en tests usan el rol `fabsoft_app` (nunca el propietario) para que RLS se ejerza de verdad.
- Fábricas de datos: `backend/tests/fixtures/factories.ts` (cliente, usuario por rol, producto, suscripción con periodos, integración con alcance).

## 3. Reloj y zona horaria

- `Clock` inyectado; `FixedClock('2026-11-01T13:00:00Z')` en tests.
- `TZ=UTC` en el proceso de test para detectar dependencias accidentales de la zona del sistema; toda lógica de negocio usa `America/Bogota` explícitamente.
- Casos frontera obligatorios: 23:30 y 00:05 hora Bogotá alrededor del vencimiento; fin de mes; 29-feb.

## 4. Catálogo de tests transversales

| ID | Tipo | Verifica |
|---|---|---|
| `T-AUTH-01` | API | Refresh rota el token (el anterior queda `rotated`). |
| `T-AUTH-02` | API | Reutilizar un refresh rotado revoca toda la familia. |
| `T-AUTH-03` | API | Usuario desactivado → 401 con JWT aún no expirado. |
| `T-AUTH-04` | API | Login: misma respuesta y tiempo similar para email inexistente/contraseña errónea; rate limit 429. |
| `T-AUTH-05` | Unit | JWT con `alg` distinto, `aud`/`iss` erróneos o `kid` desconocido → rechazado. |
| `T-AUTH-06` | API | `/auth/refresh` sin `X-Requested-With: fabsoft-web` → 403. |
| `T-API-01` | API | API key revocada, expirada o de integración `disabled` → 401. |
| `T-API-02` | API | `Authorization` + `X-Api-Key` simultáneos → 400 `ambiguous_credentials`. |
| `T-API-03` | API | Ni la API key ni tokens aparecen en logs (captura de `pino`) ni en `audit_logs`. |
| `T-API-04` | API | Rate limit por integración → 429 con `Retry-After`; `pageSize > 100` → 400. |
| `T-API-05` | API | Idempotencia: replay devuelve misma respuesta e `Idempotency-Replayed: true`; cuerpo distinto → 422; concurrente → 409. |
| `T-SEC-01` | API | Operador recibe 403 en todas las operaciones "sólo admin" de la matriz. |
| `T-SEC-02` | Arquitectura | `SystemContext` no importable desde `interfaces/http`. |
| `T-SEC-03` | BD | Cliente no puede cambiar su `role`/`client_id` (trigger). |
| `T-SEC-04` | Unit/API | Parámetro `sort` fuera de lista blanca → 400; intentos de inyección no alteran SQL. |
| `T-SEC-05` | Contrato | Respuestas a integraciones/portal sin `supplierCostAmount`/`notes`. |
| `T-SEC-06` | BD (sólo en entorno Supabase de staging) | `anon`/`authenticated` sin privilegios en `app`. |
| `T-SEC-07` | Integración | Tras una petición, una conexión reutilizada del pool no conserva `app.*` (valores vacíos). |
| `T-NOT-01` | Worker | Dispatch in-app marca `sent` y crea tarea de la regla una sola vez. |
| `T-NOT-02` | Worker | Error 5xx → `pending` con `next_attempt_at` según backoff; tras 5 → `failed`. |
| `T-NOT-03` | Worker | Error 422 de Resend → `failed` inmediato con `last_error`. |
| `T-NOT-04` | Worker | Limitador respeta `RESEND_MAX_RPS` y `Retry-After`. |
| `T-NOT-05` | Worker | `subscriptions.expire` es idempotente y elige `expired` vs `not_renewed` según `renewal_outcome`. |
| `T-INT-01` | API | Manifest inválido (scope desconocido, `own` sin `client_ids`, versión no mayor) → 422 `manifest_invalid`. |
| `T-FE-01` | Frontend | El token nunca se escribe en `localStorage`/`sessionStorage`. |
| `T-RN16-01` | Integración (DB de test) | Dos contactos principales activos para un mismo cliente fallan (índice único parcial). `backend/tests/integration/clients/primary-contact.test.ts` |
| `T-RN16-02` | Integración (DB de test) | Cambiar el contacto principal deja exactamente uno (misma transacción). `backend/tests/integration/clients/primary-contact.test.ts` |
| `T-RN16-03` | Integración (DB de test) | Archivar el contacto principal sin reemplazo devuelve 409. `backend/tests/integration/clients/primary-contact.test.ts` |

## 5. Suite de aislamiento RLS (`backend/tests/security/rls-isolation.test.ts`)

Escenario base: clientes A y B; usuarios admin, operador, clienteA, clienteB; integración `own`→B e integración `all`. Para **cada tabla** de `app` y cada actor se comprueba SELECT/INSERT/UPDATE/DELETE esperados según la tabla RLS de `docs/security/permissions-matrix.md` (test parametrizado generado desde una tabla de expectativas en código). Incluye los casos ya validados al redactar las migraciones (0 filas sin contexto, cliente A no inserta solicitud para B, operador no archiva/cancela, nadie borra, periodos inmutables, auditoría no suplantable).

## 6. Contrato OpenAPI

1. `npx @redocly/cli lint docs/api/openapi.yaml` (0 errores).
2. Test que genera el documento desde el registro `zod-to-openapi` y compara rutas, métodos, parámetros y esquemas con `docs/api/openapi.yaml` (falla si divergen).
3. En tests de API, un *helper* valida cada respuesta contra el esquema de la operación (por `operationId`).
4. Test generado: para cada operación, si no declara `apiKeyAuth`, una API key válida recibe 401/403 (RN-12, `T-RN12-03`); ninguna operación `delete` sobre recursos de negocio (`T-RN14-02`).

## 7. Frontend

- `StatusBadge`/`UrgencyBadge`: etiqueta textual presente para cada estado.
- `DataTable` + `use-url-filters`: los filtros se reflejan en la URL y en la query key.
- `client.ts`: un único refresh ante varios 401 simultáneos; tras fallo de refresh → logout.
- `RoleGate`: redirecciones por rol.
- `RenewDialog`: no permite enviar `paymentStatus=received`; muestra error de `version_conflict`.

## 8. CI (por PR)

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (incluye reglas de capas) y `pnpm typecheck`
3. `pnpm test:unit`
4. Levantar `postgres:16` como servicio → `pnpm db:migrate:test`
5. `pnpm test:integration && pnpm test:security && pnpm test:api && pnpm test:worker`
6. `npx @redocly/cli lint docs/api/openapi.yaml` + test de deriva del contrato
7. `pnpm --filter @fabsoft/frontend test && pnpm --filter @fabsoft/frontend build`
8. Escaneo de secretos.

Un PR no se fusiona con tests en rojo ni con la checklist de aislamiento (threat-model §5) incumplida en releases.
