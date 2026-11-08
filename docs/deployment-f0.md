# Sprint1 · Foundation F0 — Aprovisionamiento y migraciones

> Corte acordado Dev/Seguridad: migrator LOGIN **sin** superusuario conectado **directamente**; provisioner administrativo mínimo; runtime (`fabsoft_app`) sin DDL ni escalación. No incluye `audit_write` ni cierre de HU-08.

## URLs por capa

| Variable | Rol | Uso |
|---|---|---|
| `DATABASE_PROVISION_URL` | `fabsoft_owner` / `postgres` | Sólo harness CI y scripts de aprovisionamiento (`db:provision:*`, `db:roles:dev`). Nunca en contenedores de la app. |
| `DATABASE_MIGRATION_URL` | `fabsoft_migrator` | dbmate (historial `0001`–`0005` intacto). Conexión directa; **no** `SET ROLE` desde admin. |
| `DATABASE_URL` / `WORKER_DATABASE_URL` | `fabsoft_app` / `fabsoft_worker` | Runtime API/worker. |
| `SEED_DATABASE_URL` | provisioner | Seed/reset; validado con marcador efímero. |

## Reproducir en CI (paridad local con Postgres 16)

```bash
export APP_ENV=test
export DATABASE_PROVISION_URL='postgres://fabsoft_owner:<pwd>@localhost:5432/fabsoft_test?sslmode=disable'
export CI_MIGRATOR_PASSWORD='<migrator-pwd>'
pnpm --filter @fabsoft/backend db:provision:ci
pnpm --filter @fabsoft/backend db:provision:foundation
pnpm db:migrate
pnpm db:roles:dev
psql "$DATABASE_MIGRATION_URL" -c 'select app.assert_rls_everywhere();'
pnpm test:security
```

`db:provision:foundation` crea bases aisladas `*_f0_fresh` y `*_f0_upg`, aplica `0001` como fixture y completa hasta `0005`, comparando inventario RLS con instalación fresh.

## Desarrollo local (docker-compose)

Tras levantar `db` / `db-test` y aplicar migraciones:

```bash
export APP_ENV=dev
export SEED_ALLOWED_HOSTS=localhost,127.0.0.1
export SEED_ALLOWED_DATABASES=fabsoft,fabsoft_test
export SEED_EPHEMERAL_MARKER=dev-local
pnpm --filter @fabsoft/backend db:provision:dev
pnpm db:migrate
pnpm db:roles:dev
pnpm db:seed
```

## Seed endurecido

Requiere `APP_ENV` explícito, listas `SEED_ALLOWED_HOSTS` / `SEED_ALLOWED_DATABASES`, `SEED_EPHEMERAL_MARKER` y `fabsoft.seed_ephemeral` en la base (lo fija `db:provision:*`). `--reset` exige `SEED_ALLOW_RESET=1`. Falla **antes** de abrir `pg.Client` si el destino no está permitido. Ver `docs/seed-data.md`.

## Limitaciones documentadas

- El event trigger `fabsoft_enforce_rls` (0003) sólo se crea si el migrator es superusuario; con `fabsoft_migrator` no-superusuario la red de seguridad es `app.assert_rls_everywhere()` en migraciones y CI (no sustituye control DDL continuo en runtime).
- Los roles referenciados en migraciones con `AUTHORIZATION` / `SECURITY DEFINER` (`fabsoft_worker`, `fabsoft_secure_view`, etc.) se pre-crean en el **harness** (fuera del historial SQL) y se concede membresía a `fabsoft_migrator` para poder aplicar `0003`–`0005` sin reescribir migraciones.
- `ON CONFLICT DO NOTHING` en seed no reconcilia fixtures incompletos ni fechas desalineadas.
- No se validó despliegue Supabase gestionado en este corte; el SQL sigue siendo el mismo historial `0001`–`0005`.
