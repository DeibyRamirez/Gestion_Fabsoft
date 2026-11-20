Worker pg-boss (ADR-005): `src/main-worker.ts`.

- Colas: `subscriptions.expire`, `alerts.reconcile`, `notifications.dispatch`, `maintenance.cleanup`.
- Antes del primer arranque ejecutar `pnpm --filter @fabsoft/backend db:pgboss:install` con el rol propietario (crea y asigna el esquema `pgboss`).
- `CORREO_CANAL=log` en dev/test escribe el correo en el log; `resend` usa `RESEND_API_KEY`/`CORREO_DESDE`.
