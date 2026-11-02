# Observabilidad — FabSoft

> Alcance proporcional al tamaño (2–5 usuarios internos, pocas integraciones): logs estructurados, health checks, métricas derivadas de la BD y alertas operativas simples. Sin stack de métricas dedicado en el MVP.

## 1. Logs (pino + pino-http)

- Formato JSON a `stdout` (Docker recoge y rota). En desarrollo, `pino-pretty` sólo vía `pnpm dev` (no dependencia de producción).
- Campos estándar: `time`, `level`, `msg`, `service` (`api` | `worker`), `env`, `version` (git SHA), `requestId`, `actorType`, `userId` | `integrationId`, `route` (plantilla, p. ej. `/api/v1/subscriptions/:id`), `status`, `durationMs`, `job` (worker), `notificationId`.
- `requestId`: se acepta `X-Request-Id` entrante si es UUID; si no, se genera; se devuelve en la respuesta, se propaga a `app.request_id` (contexto RLS) y se guarda en `audit_logs.request_id`.
- **Redacción obligatoria** (`redact` de pino, `censor: '[REDACTED]'`): `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-api-key"]`, `res.headers["set-cookie"]`, `*.password`, `*.currentPassword`, `*.newPassword`, `*.temporaryPassword`, `*.apiKey`, `*.accessToken`, `*.refreshToken`, `*.token`. No se registran cuerpos de petición/respuesta.
- Niveles:
  | Nivel | Uso |
  |---|---|
  | `error` | Excepción no controlada (500), fallo de job, credencial Resend inválida, fallo de conexión a BD. |
  | `warn` | Violación RLS (`42501`, indica bug de autorización), `reuse_detected`, rate limit excedido, notificación pasada a `failed`, `version_conflict` repetido. |
  | `info` | Petición completada (pino-http), arranque/parada, ejecución de cron con contadores. |
  | `debug` | Sólo en desarrollo (SQL de repositorios sin parámetros sensibles). |
- `LOG_LEVEL` por entorno: `debug` (dev), `warn` (test), `info` (prod).

## 2. Auditoría ≠ logs

`audit_logs` es registro de negocio (quién cambió qué, RN-13), consultable desde la app y conservado indefinidamente. Los logs son operativos y efímeros (retención 30 días). No se usan logs como auditoría ni se copian secretos a ninguno de los dos.

## 3. Health checks

| Endpoint | Comprueba | Uso |
|---|---|---|
| `GET /api/v1/health` | Proceso vivo | Liveness del contenedor (Docker `HEALTHCHECK`) |
| `GET /api/v1/health/ready` | `select 1` en BD (rol `fabsoft_app`, timeout 1 s) | Readiness del proxy / despliegue |
| Worker | Latido: el worker registra en log `worker.heartbeat` cada minuto; en BD, la última ejecución completada de `notifications.dispatch` en `pgboss.job` | Detectar worker caído |

## 4. Métricas derivadas (consultas SQL, panel admin y chequeo programado)

| Métrica | Consulta / fuente | Umbral de alerta |
|---|---|---|
| Notificaciones pendientes atrasadas | `count(*) where status='pending' and scheduled_for < now() - interval '15 min' and (next_attempt_at is null or next_attempt_at < now())` | > 0 durante 15 min |
| Notificaciones fallidas 24 h | `count(*) where status='failed' and updated_at > now() - interval '24 h'` | > 0 |
| Latido del worker | `select max(completed_on) from pgboss.job where name='notifications.dispatch' and state='completed'` (las tablas de pg-boss 9 viven en el esquema `pgboss`) | > 5 min sin ejecución |
| Job de vencimiento | log `subscriptions.expire` con `updatedCount` del día | Sin ejecución tras 00:30 Bogotá |
| Errores 5xx | logs `status >= 500` | > 5 en 5 min |
| Latencia API | `durationMs` p95 de pino-http | p95 > 800 ms en 15 min |
| Violaciones RLS | logs `warn` con `code=42501` | > 0 (revisar de inmediato) |
| Rate limit integraciones | logs 429 por `integrationId` | Tendencia (informativo) |
| Pool de BD | `pool.totalCount/idleCount/waitingCount` en log cada 5 min | `waitingCount > 0` sostenido |

Implementación en el MVP: las consultas se guardan en `backend/scripts/ops-checks.sql` y se ejecutan con el rol propietario desde el cron del VPS cada 5 min (`psql ... -f ops-checks.sql`), que envía un aviso al admin si algún umbral se supera; los umbrales basados en logs se revisan con filtros sobre `docker logs`. No se añade una cola pg-boss ni endpoint nuevo para esto.

## 5. Recolección por entorno

| Entorno | Logs | Alertas |
|---|---|---|
| dev | Consola (`pino-pretty`) | — |
| test/CI | Capturados por vitest (assert de redacción) | — |
| prod (fase 1: API+worker en VPS, BD Supabase) | `docker logs` con driver `json-file` (`max-size=20m`, `max-file=5`); opcional envío a un agregador si se adopta | `ops-checks.sql` por cron + monitor externo HTTP sobre `/api/v1/health/ready` (cada 1 min) |
| prod (fase 2: todo en VPS) | Igual + logs de PostgreSQL (`log_min_duration_statement=500ms`) | Igual + espacio en disco y backups (ver `docs/deployment.md`) |

Supabase: usar además los paneles del proyecto (conexiones, CPU, consultas lentas) durante la fase 1.

## 6. Trazabilidad de una incidencia

1. El usuario reporta un error con el `requestId` mostrado en el toast de error.
2. Buscar en logs por `requestId` → ruta, actor, estado, error.
3. Si hubo escritura, `audit_logs.request_id` muestra los cambios exactos.
4. Para alertas: `notifications` (`attempts`, `last_error`, `provider_message_id`) + panel de Resend por `provider_message_id`.
