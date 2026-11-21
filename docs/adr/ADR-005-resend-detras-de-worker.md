# ADR-005 — Correo detrás de un worker (pg-boss + tabla `notifications`)

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Actualizado:** 2026-11-20 (pg-boss 12 y adaptador SMTP)
- **Detalle operativo:** `docs/notifications.md`

## Contexto

Las alertas (30/15/7/1/0/post) deben ser idempotentes, registrar estado (pendiente/enviada/fallida/cancelada), reintentarse sin perder el registro y recalcularse cuando cambian fechas (§6.7, RN-08, RN-09). El contexto técnico (§2.7, advertencia 5) prohíbe llamar al proveedor de correo desde la petición HTTP y pide worker + tabla `notifications` + idempotencia + reintentos, respetando los límites de tasa del proveedor.

## Decisión

1. La tabla **`app.notifications` es la fuente de verdad** de cada alerta y su estado. pg-boss sólo dispara trabajos; nunca se considera registro de negocio.
2. **pg-boss 12** sobre el mismo PostgreSQL (esquema `pgboss`), ejecutado en un proceso **worker** separado de la API (`pnpm --filter @fabsoft/backend worker`). Sin Redis ni servicios extra.
3. Colas:
   | Cola | Disparo | Función |
   |---|---|---|
   | `subscriptions.expire` | cron `5 0 * * *` (America/Bogota) | Pasa a `vencida`/`no_renovada` las suscripciones cuyo `current_period_end` < hoy. |
   | `alerts.reconcile` | cron `10 0 * * *` (America/Bogota) y bajo demanda tras cambios | Crea notificaciones faltantes (`ON CONFLICT (dedupe_key) DO NOTHING`) y cancela las que ya no corresponden. |
   | `notifications.dispatch` | cron `* * * * *` | Reclama notificaciones vencidas con `FOR UPDATE SKIP LOCKED`, marca in-app como `enviada` y envía email vía el adaptador configurado (Resend o SMTP). |
   | `maintenance.cleanup` | cron `30 3 * * *` | Borra `idempotency_keys` expiradas y `refresh_tokens` caducados hace > 30 días. |
4. **Idempotencia doble:** `notifications.dedupe_key` único (`exp:<subscription_id>:<rule_code>:<period_end>:<channel>:<recipient>`) y la misma clave como cabecera de idempotencia del proveedor (`Idempotency-Key` en Resend; `X-Idempotency-Key` en SMTP, sin garantía de deduplicación del servidor) para reducir el riesgo de correos duplicados si el worker murió antes de marcar `enviada`.
5. **Reintentos:** máximo 5 intentos con backoff 1 min, 5 min, 30 min, 2 h, 6 h (±20 % jitter). Errores 4xx no recuperables (salvo 429) ⇒ `fallida` inmediato. Tras el último intento ⇒ `fallida`, visible en UI y reintentable manualmente (`POST /api/v1/notifications/{id}/retry`).
6. **Límite de tasa:** el adaptador `ResendEmailSender` usa un limitador de ventana (token bucket en proceso) configurado por `RESEND_MAX_RPS` (por defecto 2) y respeta `Retry-After` ante 429.
7. **Adaptadores:** puerto `EmailSender` con implementaciones `ResendEmailSender`, `SmtpEmailSender` y `LogEmailSender` (dev/test, escribe en el log). Selección por `CORREO_CANAL=resend|smtp|log`.
8. El worker usa una conexión de **sesión** (`WORKER_DATABASE_URL`: puerto 5432 del pooler de Supabase en modo sesión o conexión directa; en VPS, conexión directa), porque pg-boss mantiene conexiones y bloqueos de larga duración.

## Alternativas consideradas

| Alternativa | Motivo de descarte |
|---|---|
| Llamar a Resend en el request | Prohibido por el contexto técnico; latencia y pérdida de correos ante fallos. |
| Supabase Edge Functions + pg_cron | Ata a Supabase; complica la migración a VPS (ADR-008). |
| BullMQ + Redis | Infraestructura adicional sin necesidad con este volumen. |
| `setInterval` en la API | No resiste múltiples instancias ni reinicios; sin registro de jobs. |

## Consecuencias

- (+) Ningún fallo de envío elimina una alerta; todo es reintentable e idempotente (no se asume ejecución única).
- (+) Portable: pg-boss sólo necesita PostgreSQL.
- (−) Un proceso adicional que monitorizar (ver `docs/observability.md`).
- (−) pg-boss 12 se usa directamente en el worker; una futura actualización mayor exige revisar `main-worker.ts` (imports, handlers por lote y creación de colas).
