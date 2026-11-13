# Sprint1 · Foundation F0 — Aprovisionamiento y migraciones

> Corte acordado Dev/Seguridad: migrator LOGIN **sin** superusuario conectado **directamente** a **todas** las migraciones `0001`–`0005`; provisioner administrativo **mínimo** (roles stub + membresías sin `ADMIN OPTION`); runtime (`fabsoft_app`) sin DDL ni escalación. No incluye `audit_write` ni cierre de HU-08.

## URLs por capa

| Variable | Rol | Uso |
|---|---|---|
| `DATABASE_PROVISION_URL` | `fabsoft_owner` / `postgres` | Sólo harness CI (`db:provision:*`). Crea migrator, stubs y tabla `fabsoft_harness.ephemeral_provenance`. |
| `DATABASE_MIGRATION_URL` | `fabsoft_migrator` | dbmate **completo** (conexión directa; **no** `SET ROLE` desde admin). |
| `DATABASE_URL` / `WORKER_DATABASE_URL` | `fabsoft_app` / `fabsoft_worker` | Runtime API/worker. |
| `SEED_DATABASE_URL` | `fabsoft_seed_writer` | Seed (NO superusuario); validado con marcador GUC **y** `fabsoft_harness.ephemeral_provenance`. |

`DATABASE_MIGRATION_URL` y `DATABASE_PROVISION_URL` deben apuntar a la **misma instalación** (host, puerto, nombre de base); el usuario puede diferir.

## Reproducir en CI (paridad local con Postgres 16)

```bash
export APP_ENV=test
export FABSOFT_MIGRATOR_TRUST=1
export DATABASE_PROVISION_URL='postgres://fabsoft_owner@localhost:5432/fabsoft_test?sslmode=disable'
pnpm --filter @fabsoft/backend db:provision:ci
pnpm --filter @fabsoft/backend db:provision:foundation
pnpm db:migrate
pnpm db:roles:dev
psql "$DATABASE_MIGRATION_URL" -c 'select app.assert_rls_everywhere();'
pnpm test:security
```

`pnpm db:migrate` ejecuta `dbmate-staged-up.ts`: lista dinámica de `backend/migrations/*.sql` y falla si el inventario aplicado no coincide (sin omitir migraciones futuras).

`db:provision:foundation` crea bases **únicas por ejecución** (`*_f0_<run>_fresh` / `*_upg`), rechaza nombres ya existentes (sin `DROP DATABASE` destructivo sobre recursos ajenos), compara inventario RLS **y** definiciones de políticas `pg_policies`, y elimina al final sólo las bases creadas por esa corrida.

## Bootstrap administrativo mínimo (honesto)

El provisioner **no** pre-crea roles stub. Crea `fabsoft_migrator` restringido (`NOCREATEROLE`, sin `ADMIN OPTION`).

**SQL histórico congelado (quién ejecuta cada tramo):**

| Migraciones | Ejecutor (conexión directa) | Script |
| --- | --- | --- |
| `0001_schema.sql` | `fabsoft_migrator` | `dbmate-staged-up.ts` (etapa migrator) |
| `0002`–`0005` | `fabsoft_owner` vía `DATABASE_PROVISION_URL` | `dbmate-staged-up.ts` (etapa provisioner) |
| `0006+` (futuro) | `fabsoft_migrator` | `dbmate-staged-up.ts` (etapa future) |

**Upgrade develop:** `fabsoft_owner` aplica la cadena `0001`–`0005` completa (como en `develop`); después `fabsoft_migrator` corre `dbmate-staged-up` (reconcilia ownership/grants de `app` siempre, no sólo con migraciones pendientes) y ejecuta `app.assert_rls_everywhere()` conectado como migrator.

## Seed endurecido

Requiere `APP_ENV` (`dev`|`test` únicamente), listas `SEED_ALLOWED_*`, `SEED_FORBIDDEN_HOSTS` no vacía (sin `-`), `SEED_EPHEMERAL_MARKER`, `SEED_HARNESS_RUN_ID`, rol `fabsoft_seed_writer` (`SEED_SESSION_ROLE`) y coincidencia de `fabsoft.seed_ephemeral` + `fabsoft_harness.ephemeral_provenance`. Falla **antes** de conectar si la URL o el denylist son inválidos; tras conectar rechaza superusuario/BYPASSRLS y verifica identidad de sesión.

## Limitaciones documentadas

- Event trigger `fabsoft_enforce_rls` (0003) sólo si el ejecutor es superusuario; con `fabsoft_migrator` la red de seguridad es `app.assert_rls_everywhere()` en migraciones y CI.
- `ON CONFLICT DO NOTHING` en seed no reconcilia fixtures incompletos.
- No se validó Supabase gestionado en este corte.

## GitGuardian — incidente histórico

El escaneo [39807174](https://github.com/DeibyRamirez/Gestion_Fabsoft/security/secret-scanning/39807174) apunta a credenciales de ejemplo en commits **publicados** del workflow (`ci_owner` / `ci_app` en `ci.yml`, commit `5c024f9`). El HEAD actual exporta URIs sin contraseña vía `export-ci-database-url.sh`. **No** se autorizó reescritura de historial (`rebase`/`force-push`/`amend`); limpiar el incidente en GitHub requiere decisión del propietario del repositorio (revocar/false positive documentado), no exclusiones del escáner.

## Bloqueador conocido (sin bypass silencioso)

Si una instalación ya contiene roles stub con atributos incompatibles con el historial `0001`–`0005`, el harness **rechaza** la ejecución en lugar de `ALTER ROLE` encubierto. Corrección: instalación desechable o migración autorizada en un PR posterior (`0006+`).
