# Repositorios PostgreSQL — contrato (0003/0004, threat-model §3, §3.1, §6)

- `app.users`: columnas explícitas (`shared/user-columns.ts`); prohibido `select *` / `returning *`.
  El hash sólo con `select app.auth_password_hash($1)` (contexto system o el propio usuario).
- Portal (rol `client`): leer **sólo** `app.portal_subscriptions` y `app.portal_subscription_periods`.
- Integraciones: leer **sólo** `app.integration_subscriptions` y `app.integration_subscription_periods`.
- SQLSTATE `42501` ⇒ HTTP 403 (`interfaces/http/middlewares/error-handler.ts`).
- `DELETE` en `app.idempotency_keys` sólo en contexto system (`maintenance/pg-idempotency-purge.ts`).
- Verificado por `tests/architecture/repository-contract.test.ts`.
