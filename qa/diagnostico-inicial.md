# Diagnóstico QA inicial — FabSoft

Fecha: 2026-11-01 · Fuente: `/workspace/fabsoft/contexto` (README.md, docs/, fuentes/, backend/)

## 0. Hallazgo base

`backend/` contiene **solo** `migrations/0001_schema.sql` y `0002_rls.sql`. No existen `backend/src/`, `backend/tests/`, `frontend/`, `package.json`, `docker-compose.yml` ni pipeline CI (`.github/` u otro). **Toda la estrategia de pruebas está documentada, ninguna está implementada.**

## 1. Estado de la estrategia de pruebas (docs/testing-strategy.md)

| Área                                                                                                                                                                    | Documentado                                                                    | Implementado                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Unit (domain/application, vitest, FixedClock, TZ=UTC, casos frontera Bogotá)                                                                                            | Sí (§1, §3); cobertura objetivo ≥90 % domain/application, ≥80 % backend        | No                                                                   |
| Integración con DB de test (Postgres 16 Docker :54329, tmpfs, dbmate mismas migraciones, rol `fabsoft_app`, `resetDatabase()`, factories)                               | Sí (§2)                                                                        | No (sí existen las migraciones que usaría)                           |
| Contrato OpenAPI (redocly lint, deriva zod-to-openapi vs `docs/api/openapi.yaml`, validación de respuestas por operationId, tests generados RN-12/RN-14)                | Sí (§6)                                                                        | No (existe solo `openapi.yaml`)                                      |
| E2E flujos A-E                                                                                                                                                          | **No documentado** en ningún archivo (no hay mención a E2E/Playwright/Cypress) | No                                                                   |
| Aislamiento RLS (`tests/security/rls-isolation.test.ts`, parametrizado por tabla×actor según permissions-matrix)                                                        | Sí (§5) + checklist threat-model §5                                            | No (políticas RLS sí en `0002_rls.sql`)                              |
| Idempotencia de alertas (RN-08: reconcile ×3, SKIP LOCKED concurrente, Idempotency-Key Resend; T-NOT-*)                                                                 | Sí                                                                             | No (soporte en BD: `notifications_dedupe_uq`, `tasks_dedupe_key_uq`) |
| CI por PR: install frozen → lint+typecheck → unit → postgres:16 + migrate → integration/security/api/worker → redocly + deriva → frontend test+build → escaneo secretos | Sí (§8)                                                                        | No hay archivo de pipeline                                           |

## 2. Trazabilidad RN-01..RN-16

Nota: ningún test existe en `backend/`; las rutas son las **previstas** en docs.

| RN    | Descripción                                                   | Tests documentados                              | ¿Existe en backend/?                                         |
| ----- | ------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| RN-01 | Suscripción pertenece a cliente y referencia producto         | T-RN01-01 integ., -02 unit, -03 API             | No                                                           |
| RN-02 | Producto con muchas suscripciones                             | T-RN02-01 integ., -02 API                       | No                                                           |
| RN-03 | Vencimiento = último día inclusivo, America/Bogota            | T-RN03-01/03 unit, -02 integ.                   | No                                                           |
| RN-04 | Periodos anteriores no se sobrescriben                        | T-RN04-01..03 integ./BD                         | No (trigger `tg_subscription_periods_guard` sí en migración) |
| RN-05 | Solicitud ≠ renovación confirmada                             | T-RN05-01 integ., -02 unit                      | No                                                           |
| RN-06 | Renovación ≠ pago recibido                                    | T-RN06-01 unit, -02 API                         | No                                                           |
| RN-07 | Vigencia, pago y seguimiento separados                        | T-RN07-01 integ., -02 unit                      | No                                                           |
| RN-08 | Alertas idempotentes                                          | T-RN08-01/02 integ., -03 unit                   | No (unique dedupe_key sí)                                    |
| RN-09 | Cambios de fecha/periodicidad/estado revisan alertas y tareas | T-RN09-01..03 integ.                            | No                                                           |
| RN-10 | Canceladas/no renovables sin alertas (salvo excepción)        | T-RN10-01..03 integ.                            | No                                                           |
| RN-11 | Cliente solo ve su organización/campos                        | T-RN11-01..04 seg./API/contrato/RLS             | No                                                           |
| RN-12 | Integraciones solo dentro de permisos                         | T-RN12-01..03 seg./API                          | No                                                           |
| RN-13 | Cambios sensibles auditados                                   | T-RN13-01/02 integ., -03 unit                   | No                                                           |
| RN-14 | No borrado físico                                             | T-RN14-01 BD, -02 API, -03 integ.               | No (`tg_prevent_delete` + REVOKE DELETE sí)                  |
| RN-15 | Lógica en servidor                                            | T-RN15-01 API, -02 arquitectura                 | No                                                           |
| RN-16 | Un único contacto principal por cliente (añadida por PO)      | T-RN16-01..03 (**nivel/ruta no especificados**) | No (índice `client_contacts_one_primary_uq` sí)              |

## 3. Flujos A-E (fuentes/funcional.md §7)

| Flujo                                                                                                                                                                             | Descripción                                                                                                        | Test E2E                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| A                                                                                                                                                                                 | Usuario interno crea cliente y registra suscripción; se calculan alertas y se audita                               | No (no documentado ni implementado) |
| B                                                                                                                                                                                 | Alerta de renovación próxima → tarea → contacto → renovar/rechazar/pendiente; actualiza alertas y historial        | No                                  |
| C                                                                                                                                                                                 | Cliente solicita renovación en portal → “pendiente de revisión” → operador resuelve → cliente ve estado            | No                                  |
| D                                                                                                                                                                                 | Admin crea integración con permisos mínimos; app consulta vencimientos por API (paginación, auditoría, rate limit) | No                                  |
| E                                                                                                                                                                                 | Usuario autorizado corrige vencimiento con motivo; auditoría del valor anterior; recalcula/cancela alertas         | No                                  |
| Parte de cada flujo está cubierta a nivel integración/API por tests RN documentados (p. ej. E ↔ T-RN09-01, C ↔ T-RN05-01, D ↔ T-RN12-*), pero no hay recorrido extremo a extremo. |

## 4. Brechas priorizadas

1. **Crítica:** cero código y cero tests; no hay scaffolding (package.json, docker-compose, vitest) ni CI.
2. **Alta:** sin estrategia E2E para flujos A-E (ni herramienta ni ubicación definidas).
3. **Alta:** suite RLS y tests BD (RN-04, RN-14, RN-16, T-SEC-03) no existen aunque las migraciones ya están y podrían probarse hoy.
4. **Media:** RN-16 sin nivel/ubicación de test; README y cabecera de business-rules dicen “RN-01 … RN-15” (inconsistencia con RN-16).
5. **Media:** contrato OpenAPI sin lint ni test de deriva en ejecución.
6. **Baja:** T-SEC-06 depende de un staging Supabase no descrito como existente.

## 5. Próximos pasos

1. Crear scaffolding de tests: `docker-compose` con `db-test` (:54329), dbmate, vitest y `resetDatabase()`/factories.
2. Implementar ya los tests SQL contra las migraciones existentes: `rls-isolation.test.ts`, T-RN04-02/03, T-RN14-01, T-RN16-01, T-RN08 (unicidad dedupe), T-SEC-03.
3. Añadir pipeline CI mínimo: redocly lint de `openapi.yaml` + migraciones + suite BD; ampliar a lint/typecheck/unit/build conforme aparezca código.
4. Definir estrategia E2E (herramienta, entorno, datos de `docs/seed-data.md`) con un escenario por flujo A-E.
5. Corregir docs: incluir RN-16 en README/cabecera y asignar nivel y ruta a T-RN16-01..03.
