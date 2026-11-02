# ADR-008 — Supabase ahora como PostgreSQL gestionado + backend propio portable (Express 5) + frontend Next.js 16

- **Estado:** Aceptada (decisión del dueño del proyecto; prevalece sobre las fuentes)
- **Fecha:** 2026-11-01
- **Reemplaza:** la ambigüedad "Next.js 16 + Supabase" vs "Express + PostgreSQL puro" de las fuentes.

## Contexto

Las fuentes se contradicen:

- El documento funcional (§1, §12) fija **Next.js 16 y Supabase** (PostgreSQL, autenticación, posible Storage, RLS).
- El contexto técnico (§1) dice "Next.js 16 + Supabase, obtener un backend construido, pero también construir nuestro backend, cuando necesitemos migrar a una DB fuera de Supabase", y a la vez una nota de coherencia afirma que "esta propuesta adopta **Express + PostgreSQL puro**", con la advertencia 14: "confirmar stack; no mezclar sin justificación".

El dueño del proyecto decidió: **arrancar sobre Supabase (PostgreSQL + RLS), pero con un backend propio robusto** (monolito modular por capas `domain / application / infrastructure / interfaces`, repositorios por caso de uso e inversión de dependencias) que funcione hoy con la base en Supabase y permita **migrar a PostgreSQL en un VPS cambiando sólo adaptadores de infraestructura**. API REST `/api/v1`, frontend en su propio directorio, monorepo pnpm, JWT para humanos, API keys hasheadas, Resend detrás de worker (pg-boss), moneda COP. Fuera: Wompi, GraphQL, microservicios, Kubernetes, mobile, websockets.

## Decisión

### 1. Qué se usa de Supabase (y qué no)

| Servicio Supabase | Uso | Motivo |
|---|---|---|
| **PostgreSQL gestionado** | ✅ Sí (fase 1) | Backups, PITR según plan, consola. |
| **RLS de PostgreSQL** | ✅ Sí, con políticas portables (`current_setting('app.*')`) | Igual en VPS (ADR-004). |
| **Supavisor (pooler)** | ✅ Modo transacción (6543) para la API; modo sesión/directo (5432) para el worker | `SET LOCAL` compatible; pg-boss necesita sesión. |
| Supabase Auth (GoTrue) | ❌ No | Auth propia JWT/argon2 (ADR-001); evita migrar `auth.users`. |
| PostgREST / Data API / `supabase-js` en navegador | ❌ No | El esquema `app` no se expone; toda lógica pasa por el backend (RN-15). |
| Storage | ❌ No en MVP | Adjuntos pendientes (pregunta 7); sólo `contract_reference` textual. |
| Edge Functions, pg_cron, Realtime | ❌ No | Worker propio con pg-boss; websockets fuera de alcance. |
| `service_role` key | ❌ Nunca en el sistema | La API usa el rol `fabsoft_app` sin BYPASSRLS. |

### 2. Backend: **Node.js 22 + Express 5 + TypeScript 5**, monolito modular por capas

- `domain` (entidades, value objects, máquina de estados, reglas puras) ← `application` (casos de uso + puertos) ← `infrastructure` (adaptadores: Postgres, pg-boss, Resend, jose, argon2) y `interfaces` (HTTP Express, worker). Dependencias siempre hacia dentro.
- Composition root manual (`composition/container.ts`), sin contenedor DI con decoradores.
- SQL explícito con `pg` 8, migraciones SQL con **dbmate** (mismo archivo en Supabase y VPS).

### 3. Frontend: **Next.js 16** (App Router) en `frontend/`, consumidor puro de `/api/v1`

- Sin acceso directo a la BD ni claves de Supabase. Sólo `NEXT_PUBLIC_API_BASE_URL`.
- Comparte DTOs/esquemas Zod con el backend vía `packages/shared`.

### 4. Portabilidad: puertos de infraestructura que cambian entre Supabase y VPS

| Puerto (application/infrastructure) | Adaptador fase 1 (Supabase) | Adaptador fase 2 (VPS) |
|---|---|---|
| `DatabaseConnectionProvider` | `SupabasePoolerProvider`: URL pooler 6543, TLS con CA de Supabase, `max` ≤ límite del plan | `DirectPostgresProvider`: host privado/local, TLS opcional en red privada, `max` según `max_connections` |
| `WorkerConnectionProvider` | Pooler modo sesión 5432 o conexión directa | Conexión directa |
| `BackupPolicy` (operativo, no código) | Backups gestionados de Supabase | `pg_dump` diario + WAL/PITR (ver `docs/deployment.md`) |
| Todo lo demás (`UnitOfWork`, repositorios, `EmailSender`, `JobQueue`, `TokenService`, `PasswordHasher`, `ApiKeyHasher`) | Idéntico | Idéntico |

La selección se hace con `DB_PROVIDER=supabase|postgres`. Ningún archivo de `domain`, `application` o `interfaces` conoce el proveedor.

### 5. Elección de framework HTTP

| Opción | Valoración |
|---|---|
| **Express 5** ✅ | Maduro, ecosistema de middlewares pedidos (`helmet`, `cors`, `express-rate-limit`, `pino-http`), Express 5 propaga errores de handlers `async`. Ligero: la arquitectura la imponen las capas, no el framework. Coincide con el veredicto "Node.js + Express ✅ Mantener" del contexto técnico. |
| Fastify | Más rendimiento y validación por esquema integrada; descartado porque el rendimiento no es un requisito (2–5 usuarios + pocas integraciones) y duplicaría la validación Zod. Sería reemplazable al estar aislado en `interfaces/http`. |
| NestJS | DI con decoradores y módulos propios: más curva y "magia" para un equipo pequeño; SOLID se consigue con composición explícita. |
| Next.js 16 Route Handlers como backend | Mezcla UI y API en un despliegue, dificulta un worker de larga duración y la separación frontend/backend pedida. |

## Alternativas globales consideradas

1. **Next.js 16 + Supabase completo** (Auth, supabase-js, RLS con `auth.uid()`): rápido al inicio, pero la migración a VPS exigiría reescribir auth, políticas y acceso a datos. Descartada.
2. **Express + PostgreSQL en VPS desde el día 1**: portable pero con más operación inicial. Se pospone a fase 2.

## Consecuencias

- (+) Migrar a VPS = cambiar variables y adaptador de conexión, restaurar datos, ejecutar las mismas migraciones (plan paso a paso en `docs/architecture.md` §7).
- (+) Un único modelo de seguridad (JWT/API keys + RLS portable) en ambos entornos.
- (−) Se implementa auth propia y un worker; no se aprovechan Auth/Storage/Realtime de Supabase.
- (−) Supabase puede asignar una versión mayor distinta de 16 al proyecto; el SQL se limita a funcionalidades disponibles en PostgreSQL 15–17 y se prueba en CI contra 16.
