# Stack técnico — FabSoft

> Versiones fijadas a rango *major* compatible (`^`) y verificadas en el registro npm el 2026-11-01. El `pnpm-lock.yaml` es la fuente de verdad de las versiones exactas. Cualquier cambio de *major* requiere PR con justificación y, si afecta a la arquitectura, un ADR.

## 1. Plataforma y herramientas base

| Componente | Versión | Justificación |
|---|---|---|
| Node.js | **22 LTS** (`engines: ">=22 <23"`, `.nvmrc` = `22`) | LTS activo; soporte nativo de `fetch`, `crypto.randomUUID`, `--env-file`, test de ESM estable. Next.js 16 exige ≥ 20.9. |
| pnpm | **9.x** (`packageManager: "pnpm@9.15.9"`) | Workspaces del monorepo, `--filter`, lockfile único, store compartido. Pedido por las fuentes. |
| TypeScript | **5.9.x** (`^5.9`) | Se fija la rama 5 por decisión del proyecto (la 7 cambia el compilador); `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. |
| PostgreSQL | **16** (VPS, docker-compose y CI) | RLS, `set_config` local, `FOR UPDATE SKIP LOCKED`, columnas generadas, índices parciales. En Supabase se usa la versión mayor que asigne el proyecto (15–17); el SQL sólo usa funcionalidades presentes en 15+ y se prueba contra 16. |
| Docker + Docker Compose v2 | Engine ≥ 24 | Postgres local/CI y despliegue en VPS (`docker compose`). |
| dbmate | **2.x** (paquete npm `dbmate`) | Migraciones en **SQL puro** con `-- migrate:up/down`, transaccionales, sin runtime de ORM: el mismo archivo corre en Supabase y en VPS. Elegido frente a `node-pg-migrate` porque las políticas RLS y triggers se escriben mejor en SQL literal y el revisor ve exactamente lo que se ejecuta. |
| ESLint 9 (flat config) + typescript-eslint 8 | `^9`, `^8` | Reglas de capas (`no-restricted-imports`) que impiden dependencias hacia fuera (ADR-006/007). |
| Prettier | `^3` | Formato único en `packages/config`. |
| tsx | `^4` | Ejecución TS en desarrollo (`tsx watch`) para API y worker. |
| @redocly/cli | `^2` (vía `npx`) | `lint` del `docs/api/openapi.yaml` en CI. |

## 2. Backend (`backend/`, paquete `@fabsoft/backend`)

| Paquete | Versión | Uso y justificación |
|---|---|---|
| `express` | `^5` | Framework HTTP (ADR-008). Express 5 propaga rechazos de handlers `async` al error handler, sin wrappers. |
| `pg` | `^8` | Driver PostgreSQL. SQL explícito en repositorios por caso de uso (ADR-007); pool singleton de infraestructura (ADR-006). Sin ORM para controlar `set_config` por transacción y consultas RLS. |
| `pg-boss` | `9.0.x` | Cola y cron sobre PostgreSQL para el worker de alertas/correos (ADR-005). Sin Redis. `schedule()` con `tz: 'America/Bogota'`. |
| `zod` | `^3.25` | Validación de entrada/salida (DTOs) y de variables de entorno. Esquemas compartidos en `packages/shared`. Se mantiene la rama 3 por compatibilidad con `zod-to-openapi` 7. |
| `@asteasolutions/zod-to-openapi` | `^7.3` | Genera componentes OpenAPI 3.1 desde los esquemas Zod; test de CI compara el resultado con `docs/api/openapi.yaml` para evitar deriva. (La rama 8 exige Zod 4.) |
| `jose` | `^6` | Firma/verificación JWT EdDSA, JWKS con `kid` para rotación (ADR-001). Sin dependencias nativas. |
| `argon2` | `^0.4x` (`^0.45`) | Hash `argon2id` de contraseñas humanas (OWASP). Binario precompilado para linux-x64/arm64. |
| `helmet` | `^8` | Cabeceras de seguridad (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP mínima para una API JSON). |
| `cors` | `^2.8` | Lista blanca exacta de orígenes del frontend (`CORS_ALLOWED_ORIGINS`), `credentials: true` sólo para `/api/v1/auth/*` y rutas humanas. |
| `express-rate-limit` | `^8` | Límites por IP en `/auth/login` y `/auth/refresh`, y por integración (`integrations.rate_limit_per_minute`) en rutas con API key. Store en memoria (una instancia de API); se sustituye por un store compartido si se escala horizontalmente (puerto `RateLimitStore`). |
| `pino` | `^9` | Logger JSON estructurado y rápido; `redact` de secretos (ver `docs/observability.md`). |
| `pino-http` | `^10` | Log por petición con `requestId`, latencia y estado; compatible con pino 9. |
| `resend` | `^6` | SDK oficial de correo, usado **sólo** dentro de `ResendEmailSender` en el worker (ADR-005), con cabecera `Idempotency-Key`. |
| `date-fns` + `@date-fns/tz` | `^4`, `^1` | Aritmética de fechas de negocio en `America/Bogota` (fin de periodo inclusivo, offsets de alertas, "hoy" de negocio). Funciones puras, testeables con reloj inyectado. |
| `vitest` | `^3.2` | Tests unitarios, de integración y de seguridad; soporte nativo TS/ESM. |
| `supertest` | `^7` | Tests HTTP de la app Express sin abrir puertos. |

## 3. Frontend (`frontend/`, paquete `@fabsoft/frontend`)

| Paquete | Versión | Uso y justificación |
|---|---|---|
| `next` | `^16` | App Router, layouts separados interno/portal, Turbopack. Recomendado por el dueño y presente en el funcional. Sólo consume `/api/v1`. |
| `react` / `react-dom` | `^19` | Requerido por Next 16. |
| `tailwindcss` | `^4` | Tokens de diseño en `@theme` (CSS variables) definidos en `docs/design.md`. |
| shadcn/ui (CLI `shadcn`) | última del CLI al generar | Componentes accesibles basados en Radix copiados al repo (`src/shared/ui`), sin dependencia de runtime cerrada; se adaptan a los tokens. |
| `lucide-react` | `^1` | Iconos usados por shadcn/ui. |
| `react-hook-form` | `^7.55` | Formularios con validación en cliente usando los **mismos** esquemas Zod del backend (UX; la autorización y validación real están en servidor, RN-15). |
| `@hookform/resolvers` | `^5` | Adaptador Zod 3 ↔ react-hook-form. |
| `@tanstack/react-query` | `^5` | Caché de datos de servidor, paginación, invalidación tras mutaciones, reintentos controlados. |
| `vitest` + `@testing-library/react` | `^3.2`, `^16` | Tests de componentes y hooks. |

## 4. Paquetes compartidos

| Paquete | Contenido |
|---|---|
| `@fabsoft/shared` | Esquemas Zod de DTOs (request/response), enums (`SubscriptionStatus`, `TaskStatus`, scopes...), constantes (`DEFAULT_PAGE_SIZE=20`, `MAX_PAGE_SIZE=100`, `BUSINESS_TIMEZONE='America/Bogota'`, `CURRENCY='COP'`), tipos de error (`ProblemCode`). Sin dependencias de Node ni de React. |
| `@fabsoft/config` | `tsconfig.base.json`, `eslint.config.js` (incluye reglas de capas), `prettier.config.js`. |

## 5. Servicios externos

| Servicio | Uso | Entornos |
|---|---|---|
| Supabase (PostgreSQL gestionado) | BD fase 1 (ADR-008). Sólo Postgres + Supavisor. | prod (y opcionalmente staging) |
| PostgreSQL 16 en VPS | BD fase 2 | prod tras migración |
| Resend | Correo transaccional de alertas | prod (`EMAIL_TRANSPORT=resend`); dev/test usan `log` |

## 6. Excluido explícitamente

Wompi u otra pasarela (ADR-003), GraphQL (ADR-002), microservicios, Kubernetes, app móvil, websockets/Realtime, Supabase Auth/Storage/Edge Functions/`supabase-js` en navegador (ADR-008), ORMs, Redis, contenedores DI con decoradores.
