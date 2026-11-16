# Mapa T-F0 (plan QA ↔ suite)

| ID QA | Caso | Ubicación |
| --- | --- | --- |
| T-F0-01 | Migrator LOGIN restringido (sin super/CREATEROLE/ADMIN) | `foundation-f0.test.ts` |
| T-F0-02 | Rol provisioner separado (`fabsoft_provisioner`) | **pendiente, diferido PO** (hoy: owner/postgres en harness; runtime sin super) |
| T-F0-03 | Migrator deniega escalación; LOGIN directo `fabsoft_app` | `foundation-f0.test.ts`, `roles.test.ts` |
| T-F0-03b | `DATABASE_MIGRATION_URL` no superusuario / no provisioner | `migrator-connection.test.ts` |
| T-F0-04 | Misma instalación provision/migrator | `foundation-f0.test.ts` |
| T-F0-05 | Arquitectura tests security/api/integration sin `withOwnerSystemContext` | `f0-architecture.test.ts`, provenance en `foundation-f0.test.ts`; integración usa `withAppContext` |
| T-F0-06 | `fabsoft_app` acceso positivo admin | `rls-effective.test.ts` |
| T-F0-07 | Contexto `app.*` no persiste en pool | `rls-effective.test.ts` |
| T-F0-08 | Inventario RLS 18 tablas | `rls-effective.test.ts` |
| T-F0-08b | Event trigger: fresh vs `FABSOFT_EXPECT_EVENT_TRIGGER=1` (upgrade) | `rls-effective.test.ts` |
| T-F0-09 / T-F0-09c | Aislamiento A/B + RLS efectivo dos alcances (cliente) | `rls-effective.test.ts`, mutación políticas `rls-policy-mutation.test.ts` |
| T-F0-10 / 10d | Sin owner `fabsoft_owner` en fresh | `no-owner-assertions.test.ts` |
| T-F0-10c | worker CREATE TABLE/FUNCTION 42501 | `no-owner-assertions.test.ts` |
| T-F0-11 | Cierre elevación migrator (CTE + grantor + miembro) | `foundation-f0.test.ts` |
| T-F0-12 | Inventario owners tras 0002–5 | `foundation-f0.test.ts` |
| P0 / T-SEC-30 | EXECUTE definer + permission denied (BD sin admin) | `definer-privileges.test.ts` |
| ACL M2–M4, N4 | Mutaciones rompen paridad (N4: default EXECUTE→app) | `acl-parity-mutation.test.ts` |
| Migrator defaults | Global sin EXECUTE PUBLIC en función nueva | `migrator-default-privileges.test.ts` |
| seed --reset | Rechazo otra BD sin marcador | `seed-reset-guard.test.ts` |
| T-GUARD-01 | Denylist vacía / `-` / `,` | `guard.test.ts` |

Suite `security`: `--no-file-parallelism`.
