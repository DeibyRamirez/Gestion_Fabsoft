# Mapa T-F0 (plan QA ↔ suite)

| ID QA | Caso | Ubicación |
| --- | --- | --- |
| T-F0-01 | Migrator LOGIN restringido (sin super/CREATEROLE/ADMIN) | `foundation-f0.test.ts` |
| T-F0-02 | Roles runtime + seed/migrator sin SUPERUSER ni BYPASSRLS (provisioner documenta bootstrap admin remoto) | `roles.test.ts` |
| T-F0-03 | Migrator deniega escalación (`42501`); LOGIN directo `fabsoft_app` | `foundation-f0.test.ts`, `roles.test.ts` |
| T-F0-03b | `DATABASE_MIGRATION_URL` no superusuario / no provisioner | `migrator-connection.test.ts` |
| T-F0-04 | Misma instalación provision/migrator | `foundation-f0.test.ts` |
| T-F0-05 | Procedencia efímera harness (sin `withOwnerSystemContext` en tests) | `foundation-f0.test.ts` |
| T-F0-06 | `fabsoft_app` acceso positivo admin | `rls-effective.test.ts` |
| T-F0-07 | Contexto `app.*` no persiste en pool | `rls-effective.test.ts` |
| T-F0-08 | Inventario RLS 18 tablas | `rls-effective.test.ts` |
| T-F0-08b | CI fresh: **sin** `fabsoft_enforce_rls` (asimetría sólo en harness upgrade) | `rls-effective.test.ts` |
| T-F0-09 | Aislamiento A/B `clients` + lista 18 tablas con políticas | `rls-effective.test.ts` |
| T-F0-10 | Objetos `app` sin owner `fabsoft_owner`; worker sin CREATE | `no-owner-assertions.test.ts` |
| T-F0-10d | Regresión owner en fresh (dbmate) | `no-owner-assertions.test.ts` |
| T-F0-11 | Cierre elevación: migrator sin membresías + grantor migrator | `foundation-f0.test.ts` |
| T-F0-12 | Inventario owners/ACL tras 0002–5 por migrator | `foundation-f0.test.ts` |
| P0 / T-SEC-30 | EXECUTE definer + bootstrap 42501 sin crear admin | `definer-privileges.test.ts`, `security-hardening.test.ts` |
| T-GUARD-01 | Denylist vacía / `-` / `,` rechazada antes de conectar | `guard.test.ts` |

Bootstrap aislado: `fabsoft_owner` / `postgres` sólo en harness; no figura en `RUNTIME_LOGIN_ROLES`.

Suite `security`: `--no-file-parallelism` en CLI.
