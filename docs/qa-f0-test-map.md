# Mapa T-F0 (plan QA ↔ suite)

| ID QA | Caso | Ubicación |
| --- | --- | --- |
| T-F0-01 | Migrator LOGIN restringido (sin super/CREATEROLE/ADMIN) | `foundation-f0.test.ts` |
| T-F0-02 | Roles runtime + seed/migrator sin SUPERUSER ni BYPASSRLS | `roles.test.ts` |
| T-F0-03 | Migrator deniega escalación (`42501`) | `foundation-f0.test.ts` |
| T-F0-03b | `DATABASE_MIGRATION_URL` no superusuario / no provisioner | `migrator-connection.test.ts` |
| T-F0-04 | Misma instalación provision/migrator | `foundation-f0.test.ts` |
| T-F0-05 | Procedencia efímera harness | `foundation-f0.test.ts` |
| T-F0-06 | `fabsoft_app` acceso positivo admin | `rls-effective.test.ts` |
| T-F0-07 | Contexto `app.*` no persiste en pool | `rls-effective.test.ts` |
| T-F0-08 | Inventario RLS 18 tablas + nota event trigger | `rls-effective.test.ts` |
| T-F0-09 | Aislamiento A/B (SELECT/INSERT/UPDATE `clients`) | `rls-effective.test.ts` |
| T-F0-10 | Objetos `app` sin owner `fabsoft_owner`; worker sin CREATE | `no-owner-assertions.test.ts` |
| T-F0-11 | Cierre elevación: migrator sin membresías (CTE recursivo) | `foundation-f0.test.ts` |
| T-F0-12 | Inventario owners/ACL tras 0002–5 por migrator | `foundation-f0.test.ts` |
| T-GUARD-01 | Denylist vacía / `-` / `,` rechazada antes de conectar | `guard.test.ts` |

Bootstrap aislado: `fabsoft_owner` / `postgres` sólo en harness; no figura en `RUNTIME_LOGIN_ROLES`.

Suite `security`: `fileParallelism: false` (sin TRUNCATE global entre archivos).
