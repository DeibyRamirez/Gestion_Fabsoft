# Sprint1 · Foundation F0 — Aprovisionamiento y migraciones

> Corte acordado Dev/Seguridad: migrator LOGIN **sin** superusuario ejecuta `0001`–`0005` en BD **desechable** (`0002`–`0005` con elevación efímera administrada por el provisioner); runtime (`fabsoft_app`) sin DDL ni escalación. `0006_audit_write.sql` introduce `app.audit_write` (dueño `fabsoft_audit_definer`); no cierra HU-08 (lectura/UI).

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

El provisioner crea `fabsoft_migrator` restringido (`NOCREATEROLE`) y, **sólo en BD efímera**, pre-crea roles stub, concede `CREATE` **efímero** en `app` a roles destino de `ALTER OWNER` (`fabsoft_secure_view`, `fabsoft_auth_definer`, `fabsoft_worker`) y eleva/retira membresías temporales (`migrator-historical-elevation.ts`). En el `finally` del cierre se ejecuta `revokeHistoricalRoleSchemaCreate` (**revoca CREATE**, conserva USAGE como develop) y `REVOKE ALL ON DATABASE … FROM fabsoft_migrator CASCADE` para privilegios de base otorgados durante `0002`; después se re-emite `GRANT fabsoft_app TO fabsoft_worker` y `CONNECT` al migrator. Tras **upgrade** histórico se revoca además `CREATE ON DATABASE` al migrator (fresh sí lo conserva hasta cerrar `0001`). `fabsoft_bootstrap` no ejecuta `0002`–`0005`.

`dbmate-staged-up.ts` rechaza `DATABASE_MIGRATION_URL` distinto de `fabsoft_migrator` o con `SUPERUSER`/`BYPASSRLS`.

Paridad fresh/upgrade en `db:provision:foundation`: owners de tablas + líneas `aclexplode` (nsp, rel, **att**, pro con **firma**, typ, `pg_default_acl` con **defaclrole** y entradas **globales** `defaclnamespace=0`), sin grantor ni filas concedidas a `fabsoft_owner` en rutas upgrade. **Única asimetría permitida:** event trigger `fabsoft_enforce_rls` en upgrade histórico con superusuario. Mutaciones M2–M4 en `acl-parity-mutation.test.ts` deben romper la paridad.

`dbmate-staged-up.ts` **no** reasigna objetos `fabsoft_owner`→migrator; sólo elevación efímera 0002–0005, `repairHistoricalMigrationGrants`, `assertNoFabsoftOwnerInApp`, gate SECURITY DEFINER sin EXECUTE a PUBLIC, y `assert_rls_everywhere()`. La reconciliación de ownership es **explícita** (abajo).

### Reconcile owner → migrator (upgrade real)

Cuando una BD instalada con `fabsoft_owner` aplicó `0001`–`0005` completa (ruta develop histórica):

```bash
export DATABASE_PROVISION_URL='postgres://fabsoft_owner@.../MI_BD?sslmode=disable'
export DATABASE_MIGRATION_URL='postgres://fabsoft_migrator@.../MI_BD?sslmode=disable'
pnpm --filter @fabsoft/backend db:reconcile:owner-to-migrator
pnpm db:migrate   # valida que no queden objetos app de fabsoft_owner
```

`reconcileFabsoftOwnerAppObjectsToMigrator` reasigna schema/tablas/vistas/secuencias/funciones/tipos, reaplica grants idempotentes, revoca `CREATE ON DATABASE` al migrator y falla cerrado si la BD no es la del harness seed cuando aplica. CI: `db:provision:develop-upgrade` ejecuta la misma ruta en BD efímera antes de migrar como migrator.

### Migraciones `0006+` (regla PO)

En SQL nuevo: **REVOKE/GRANT antes de ALTER OWNER**; si el dueño cambia, el provisioner debe poder repetir grants en teardown (patrón `repairHistoricalMigrationGrants`). Funciones nuevas del migrator **no** reciben `EXECUTE` para `fabsoft_app` por defecto (`alter default privileges … revoke execute on functions from fabsoft_app`); hay que conceder `GRANT EXECUTE` explícito por función. Al final de `db:migrate`: gate prosecdef (todos los schemas no-sistema) sin `EXECUTE` a `PUBLIC` ni `fabsoft_worker` en `bootstrap_first_admin`; `repairHistoricalMigrationGrants` falla si detecta `GRANT` inesperado a `PUBLIC` antes de reparar.

**SQL histórico congelado (quién ejecuta cada tramo):**

| Migraciones | Ejecutor (conexión directa) | Script |
| --- | --- | --- |
| `0001_schema.sql` | `fabsoft_migrator` | `dbmate-staged-up.ts` (etapa migrator) |
| `0002`–`0005` | `fabsoft_migrator` (elevación efímera: owner eleva → dbmate → owner cierra) | `dbmate-staged-up.ts` + `migrator-historical-elevation.ts` |
| `0006+` (futuro) | `fabsoft_migrator` | `dbmate-staged-up.ts` (etapa future) |

**Upgrade develop:** `fabsoft_owner` aplica `0001`–`0005`; **`db:reconcile:owner-to-migrator`** (o perfil `develop-historical-upgrade`); después `fabsoft_migrator` en `dbmate-staged-up` (inventario + gates, no ownership reconcile).

**VPS / instalación existente (`0006+`):** con `DATABASE_MIGRATION_URL` apuntando a `fabsoft_migrator` (proviso tras `db:roles:dev` o `db:provision:ci`), ejecutar `pnpm db:migrate` una vez; validar `select app.assert_rls_everywhere();` y gate prosecdef. No aplicar `0006_audit_write.sql` conectado como `fabsoft_owner` en producción (el provisioner eleva sólo en BD efímera; el post-paso `assignAuditWriteDefinerOwner` exige harness).

## Seed endurecido

Requiere `APP_ENV` (`dev`|`test` únicamente), listas `SEED_ALLOWED_*`, `SEED_FORBIDDEN_HOSTS` no vacía (sin `-`), `SEED_EPHEMERAL_MARKER`, `SEED_HARNESS_RUN_ID`, rol `fabsoft_seed_writer` (`SEED_SESSION_ROLE`) y coincidencia de `fabsoft.seed_ephemeral` + `fabsoft_harness.ephemeral_provenance`. Falla **antes** de conectar si la URL o el denylist son inválidos; tras conectar rechaza superusuario/BYPASSRLS y verifica identidad de sesión.

**`--reset`:** única operación de seed con privilegio elevado (provisioner). Exige `SEED_ALLOW_RESET=1`, misma host/puerto/BD que `SEED_DATABASE_URL` en `DATABASE_PROVISION_URL`, y marcador harness **antes** de cualquier `TRUNCATE` (sin `session_replication_role=replica`). **Deuda PO:** sustituir TRUNCATE vía owner por rol dedicado `fabsoft_seed_reset` con privilegios mínimos (sólo tablas seed); se acepta temporalmente en BD efímera con el guard actual.

## Limitaciones documentadas

- Event trigger `fabsoft_enforce_rls` (0003) sólo si el ejecutor es superusuario; con migrator sin superusuario el bloque `do $$ … rolsuper` emite NOTICE y **no** crea el event trigger (red de seguridad: `app.assert_rls_everywhere()` en CI). No es bypass silencioso: sentencia exacta en `0003_security_hardening.sql` líneas 73–82.
- `ON CONFLICT DO NOTHING` en seed no reconcilia fixtures incompletos.
- No se validó Supabase gestionado en este corte.

## GitGuardian — incidente histórico

El escaneo [39807174](https://github.com/DeibyRamirez/Gestion_Fabsoft/security/secret-scanning/39807174) apunta a credenciales de ejemplo en commits **publicados** del workflow (`ci_owner` / `ci_app` en `ci.yml`, commit `5c024f9`). El HEAD actual exporta URIs sin contraseña vía `export-ci-database-url.sh`. **No** se autorizó reescritura de historial (`rebase`/`force-push`/`amend`); limpiar el incidente en GitHub requiere decisión del propietario del repositorio (revocar/false positive documentado), no exclusiones del escáner.

## Bloqueador conocido (sin bypass silencioso)

Si una instalación ya contiene roles stub con atributos incompatibles con el historial `0001`–`0005`, el harness **rechaza** la ejecución en lugar de `ALTER ROLE` encubierto. Corrección: instalación desechable o migración autorizada en un PR posterior (`0006+`).
