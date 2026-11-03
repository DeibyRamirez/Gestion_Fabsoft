# FabSoft — Gestión de clientes, suscripciones y renovaciones

Monorepo pnpm: API REST `/api/v1` (Express 5 + TypeScript, monolito modular por capas) y frontend Next.js 16. Contexto: [`docs/project-context.md`](docs/project-context.md) · Arquitectura: [`docs/architecture.md`](docs/architecture.md) · Stack: [`docs/stack.md`](docs/stack.md) · [ADR-008](docs/adr/ADR-008-express-postgres-vs-next-supabase.md).

Estado de construcción para agentes: [`memory.md`](memory.md) · [`todo.md`](todo.md).

## Estructura

```
.
├── pnpm-workspace.yaml   # backend, frontend, packages/*
├── package.json          # scripts raíz
├── packages/
│   ├── config/           # @fabsoft/config: tsconfig base, ESLint 9 (reglas de capas), Prettier
│   └── shared/           # @fabsoft/shared: esquemas Zod, enums, constantes (consumido por backend y frontend)
├── backend/              # @fabsoft/backend: API :4000
│   ├── src/{domain,application,infrastructure,interfaces,composition}
│   ├── migrations/       # SQL de referencia (HT-03 las gestiona; aún no hay dbmate)
│   └── tests/{api,architecture}
├── frontend/             # @fabsoft/frontend: Next.js 16 :3000
└── docs/                 # documentación del proyecto
```

## Prerrequisitos

**Node.js 22 LTS** obligatorio (`engines` y [`.nvmrc`](.nvmrc); no usar Node 24+). pnpm 9: `corepack enable && corepack prepare pnpm@9.15.9 --activate`.

En Windows: `nvm-windows`, `fnm` u otro gestor alineado con `.nvmrc`.

## Cómo correr

Ejecutar comandos desde la **raíz del monorepo** (donde está `pnpm-workspace.yaml`), no solo desde `backend/` o `frontend/`.

```bash
pnpm install
cp backend/.env.example backend/.env     # API, worker y scripts de BD
cp frontend/.env.example frontend/.env   # sólo NEXT_PUBLIC_* (Next.js lee este directorio)
docker compose up -d db              # PostgreSQL 16 en localhost:54320 (db-test en :54329)
pnpm db:migrate                      # dbmate up (lee backend/.env; funciona en Windows)
pnpm db:roles:dev                    # LOGIN para fabsoft_app / fabsoft_worker con las claves de backend/.env (sólo dev)
pnpm db:seed                         # datos demo (docs/seed-data.md); --reset para resembrar
pnpm dev                # API http://localhost:4000/api/v1  +  web http://localhost:3000
curl http://localhost:4000/api/v1/health   # {"status":"ok","version":"0.1.0"}
```

En local, `CORS_ALLOWED_ORIGINS` en `backend/.env` debe incluir el origen del frontend (p. ej. `http://localhost:3000`), alineado con `FRONTEND_URL` y con la URL que uses en el navegador.

**Solo API o solo web:** `pnpm --filter @fabsoft/backend dev` o `pnpm --filter @fabsoft/frontend dev`. Cada paquete compila `@fabsoft/shared` antes de arrancar (`predev`); si falla `Cannot find module …/shared/dist`, ejecuta una vez `pnpm --filter @fabsoft/shared build` desde la raíz.

Producción local: `pnpm build`, luego `pnpm --filter @fabsoft/backend start` y `pnpm --filter @fabsoft/frontend start`.

## Scripts raíz

| Script                              | Acción                                                               |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                          | shared (watch) + API (`tsx watch`) + web (`next dev`) en paralelo    |
| `pnpm build`                        | Compila en orden topológico: shared → backend → frontend             |
| `pnpm lint`                         | ESLint 9 en todos los paquetes (incluye reglas de capas del backend) |
| `pnpm typecheck`                    | `tsc --noEmit` en todos los paquetes (compila shared primero)        |
| `pnpm format` / `pnpm format:check` | Prettier                                                             |
| `pnpm test` / `pnpm test:unit`      | Vitest (backend: health API, caso de uso y test de arquitectura)     |

Auth (HU-01): `POST /api/v1/auth/{login,refresh,logout,change-password}`, `GET /api/v1/auth/me`, `/api/v1/users*` (sólo admin). Web: `/login`, `/change-password`, `/dashboard`, `/admin/users`, `/portal`.

Pendiente: `test:integration|api|worker`, `db:migrate:test` (testing-strategy §8), worker (ADR-005), API keys de integraciones.
