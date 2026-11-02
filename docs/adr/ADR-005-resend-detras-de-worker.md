# ADR-005 — Resend detrás de un worker (pg-boss + tabla `notifications`)

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Detalle operativo:** `docs/notifications.md`

## Contexto

Las alertas (30/15/7/1/0/post) deben ser idempotentes, registrar estado (pendiente/enviada/fallida/cancelada), reintentarse sin perder el registro y recalcularse cuando cambian fechas (§6.7, RN-08, RN-09). El contexto técnico (§2.7, advertencia 5) prohíbe llamar a Resend desde la petición HTTP y pide worker + tabla `notifications` + idempotencia + reintentos, respetando los límites de tasa de Resend.

## Decisión

1. La tabla **`app.notifications` es la fuente de verdad** de cada alerta y su estado. pg-boss sólo dispara trabajos; nunca se considera registro de negocio.
2. **pg-boss 9** sobre el mismo PostgreSQL (esquema `pgboss`), ejecutado en un proceso **worker** separado de la API (`pnpm --filter @fabsoft/backend worker`). Sin Redis ni servicios extra.
3. Colas:
   | Cola | Disparo | Función |
   |---|---|---|
   | `subscriptions.expire` | cron `5 0 * * *` (America/Bogota) | Pasa a `expired`/`not_renewed` las suscripciones cuyo `current_period_end` < hoy. |
   | `alerts.reconcile` | cron `10 0 * * *` (America/Bogota) y bajo demanda tras cambios | Crea notificaciones faltantes (`ON CONFLICT (dedupe_key) DO NOTHING`) y cancela las que ya no corresponden. |
   | `notifications.dispatch` | cron `* * * * *` | Reclama notificaciones vencidas con `FOR UPDATE SKIP LOCKED`, marca in-app como `sent`, envía email vía Resend, crea tareas de la regla. |
   | `renewal-requests.created` | `send()` transaccional desde el caso de uso | Crea tarea `review_renewal_request` y notificaciones al equipo. |
   | `maintenance.cleanup` | cron `30 3 * * *` | Borra `idempotency_keys` expiradas y `refresh_tokens` caducados hace > 30 días. |
4. **Idempotencia doble:** `notifications.dedupe_key` único (`exp:<subscription_id>:<rule_code>:<period_end>:<channel>:<recipient>`) y la misma clave como cabecera `Idempotency-Key` de Resend (ventana de 24 h del proveedor) para cubrir el caso "Resend aceptó pero el worker murió antes de marcar `sent`".
5. **Reintentos:** máximo 5 intentos con backoff 1 min, 5 min, 30 min, 2 h, 6 h (±20 % jitter). Errores 4xx no recuperables (salvo 429) ⇒ `failed` inmediato. Tras el último intento ⇒ `failed`, visible en UI y reintentable manualmente (`POST /api/v1/notifications/{id}/retry`).
6. **Límite de tasa:** el adaptador `ResendEmailSender` usa un limitador de ventana (token bucket en proceso) configurado por `RESEND_MAX_RPS` (por defecto 2) y respeta `Retry-After` ante 429.
7. **Adaptadores:** puerto `EmailSender` con implementaciones `ResendEmailSender` (prod) y `LogEmailSender` (dev/test, escribe en el log). Selección por `EMAIL_TRANSPORT=resend|log`.
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
- (−) La versión 9 de pg-boss requiere migrar a 10 en el futuro (cambia el modelo de colas); queda acotado al adaptador `PgBossJobQueue`.
