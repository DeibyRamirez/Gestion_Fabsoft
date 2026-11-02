# Alertas y notificaciones — FabSoft

> Decisión: ADR-005 (Resend detrás de worker pg-boss). Tabla: `app.notifications`. Reglas: RN-08, RN-09, RN-10. Funcional §6.7 y Flujo B.

## 1. Conceptos

- **Alerta** = fila en `notifications` (informa). **Tarea** = fila en `tasks` (acción). Una regla puede crear ambas, pero son entidades distintas (§4 funcional).
- Cada alerta tiene **canal** (`in_app` siempre disponible; `email` vía Resend) y **destinatario** (`recipient_user_id`).
- La BD es la única fuente de verdad de fechas (no calendarios externos).

## 2. Política por defecto (configurable en `/api/v1/alert-rules`)

| Código | `offset_days` | Momento | Propósito (§6.7) | Canales | Crea tarea |
|---|---|---|---|---|---|
| `D30` | 30 | 30 días antes | Preparar la renovación | in_app, email | `send_proposal` (media) |
| `D15` | 15 | 15 días antes | Contactar al cliente | in_app, email | `contact_client` (alta) |
| `D7` | 7 | 7 días antes | Hacer seguimiento | in_app, email | — |
| `D1` | 1 | 1 día antes | Vencimiento inminente | in_app, email | — |
| `D0` | 0 | Día del vencimiento | Comprobar el estado | in_app | — |
| `POST1` | −1 | 1 día después | Requiere revisión | in_app, email | `review_expired` (urgente) |

- **Fecha programada:** `scheduled_for = (current_period_end − offset_days) a las 08:00 America/Bogota` (13:00 UTC).
- **Destinatarios** (pregunta funcional 8 pendiente; regla inicial): responsable de la suscripción (`subscriptions.owner_user_id`) → si es nulo, responsable del cliente (`clients.owner_user_id`) → si es nulo, todos los admins activos. Sólo usuarios internos activos.
- Las tareas automáticas se asignan al mismo destinatario principal, con `due_date = fecha de la alerta + 2 días` (y nunca posterior al vencimiento para reglas previas).
- **Email:** habilitado por regla (`channels`) y globalmente por `EMAIL_TRANSPORT=resend`. Con `EMAIL_TRANSPORT=log` (dev/test) el envío se escribe en log y se marca `sent`.

## 3. Programación (scheduling)

```mermaid
sequenceDiagram
  participant UC as Caso de uso (API)
  participant DB as PostgreSQL
  participant Q as pg-boss
  participant W as Worker
  participant R as Resend
  UC->>DB: crea/renueva/corrige suscripción (tx)
  UC->>DB: INSERT notifications ... ON CONFLICT (dedupe_key) DO NOTHING (misma tx)
  Note over Q,W: cron * * * * * notifications.dispatch
  W->>DB: SELECT ... FOR UPDATE SKIP LOCKED (due, pending)
  W->>DB: in_app → status=sent (+ tarea de la regla)
  W->>DB: email → attempts+1, locked_until=now()+2min (commit)
  W->>R: POST /emails (Idempotency-Key = dedupe_key)
  R-->>W: 200 id / error
  W->>DB: sent (provider_message_id) | pending + next_attempt_at | failed
```

1. **En línea (misma transacción del caso de uso):** al crear, activar, renovar o corregir una suscripción se insertan las notificaciones del periodo vigente para todas las reglas activas aplicables cuya fecha programada sea **≥ hoy** (no se generan alertas retroactivas de anticipaciones ya pasadas; la regla más próxima no vencida sí).
2. **Reconciliación (`alerts.reconcile`, diaria 00:10 Bogotá y tras cambiar reglas):** recorre suscripciones `active`/`in_renewal`/`expired` y:
   - inserta las faltantes (`ON CONFLICT DO NOTHING`);
   - cancela pendientes cuyo `period_end` ≠ `current_period_end`, cuya regla está inactiva o cambió de `offset_days`, o cuya suscripción ya no es elegible (RN-10).
3. **Elegibilidad (RN-10):** `status ∉ {cancelled, not_renewed, pending_activation}` y (`is_renewable = true` y `renewal_outcome` del periodo vigente ≠ `not_renewed`) **o** `alert_rules.applies_when_not_renewable = true`. Las reglas `D0`/`POST1` aplican también a `expired`.

### Clave de idempotencia (RN-08)

```
exp:<subscription_id>:<rule_code>:<period_end YYYY-MM-DD>:<channel>:<recipient_user_id>
rr:<renewal_request_id>:<channel>:<recipient_user_id>
```

Una misma regla nunca produce dos filas para la misma suscripción y periodo (y canal/destinatario). Si cambia `period_end`, la clave cambia: las antiguas se cancelan y se crean nuevas.

## 4. Estados

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> sent : entregado (in_app visible / Resend 2xx)
  pending --> pending : fallo recuperable (attempts+1, next_attempt_at)
  pending --> failed : fallo permanente o attempts = max_attempts
  pending --> cancelled : recálculo / renovación / cancelación / no elegible
  failed --> pending : POST /notifications/{id}/retry (admin)
  sent --> [*]
  cancelled --> [*]
```

- `sent` y `cancelled` son finales. `failed` es reintentable manualmente.
- **Un fallo nunca borra la alerta** (§6.7): queda con `last_error` (texto truncado a 2000 caracteres, sin datos personales del cuerpo del correo) y `attempts`.
- Las alertas `in_app` visibles al usuario son las `sent`; `read_at` marca lectura.

## 5. Reintentos y backoff (canal email)

| Intento | Espera antes del siguiente |
|---|---|
| 1 → 2 | 1 min |
| 2 → 3 | 5 min |
| 3 → 4 | 30 min |
| 4 → 5 | 2 h |
| 5 | → `failed` |

- Jitter ±20 % para no sincronizar reintentos. `max_attempts` por defecto 5 (1–10).
- **Clasificación de errores** (`ResendEmailSender`):
  - Recuperables: timeout/red, HTTP 429 (respeta `Retry-After` si es mayor que el backoff), 5xx.
  - Permanentes ⇒ `failed` inmediato: 400/401/403/404/422 (p. ej. dirección inválida, dominio no verificado, clave inválida). Un 401/403 además emite log `error` "credencial Resend inválida".
- **Caída del worker tras enviar y antes de marcar `sent`:** `locked_until` expira (2 min) y la fila se vuelve a reclamar; Resend deduplica por `Idempotency-Key` durante 24 h, así que no hay correo duplicado.
- **Límite de tasa:** `RESEND_MAX_RPS` (por defecto 2) aplicado por el adaptador; el lote por ejecución es de 50 notificaciones.

## 6. Recálculo

| Evento | Acción sobre alertas | Acción sobre tareas |
|---|---|---|
| `POST /subscriptions` (activa) / `POST /subscriptions/{id}/activate` | Programar periodo vigente | — |
| `POST /subscriptions/{id}/renew` | Cancelar `pending` del periodo anterior (`renewed`); programar el nuevo | Completar abiertas automáticas del periodo anterior con resultado "Renovación confirmada"; resolver solicitudes abiertas |
| `POST /subscriptions/{id}/correct-expiration` | Cancelar `pending` con `period_end` antiguo (`period_end_changed`); programar el nuevo | Cancelar automáticas `pending` del periodo antiguo; las `in_progress` se conservan con nota añadida |
| `POST /subscriptions/{id}/not-renewed` | Cancelar `pending` de reglas sin excepción (`not_renewed`) | Cerrar automáticas de renovación; crear `record_non_renewal` sólo si no hay motivo |
| `POST /subscriptions/{id}/cancel` | Cancelar todas las `pending` (`subscription_cancelled`) | Cancelar todas las abiertas de la suscripción |
| `PATCH isRenewable=false` | Cancelar `pending` sin excepción | — |
| `PATCH isRenewable=true` | Programar las que correspondan | — |
| `PATCH /alert-rules/{id}` | Encolar `alerts.reconcile` | — |
| Job `subscriptions.expire` | Nada que cancelar (las `D0`/`POST1` siguen válidas) | — |

## 7. Notificaciones por evento

- `renewal_request_created`: el caso de uso encola `renewal-requests.created` en la misma transacción; el worker (contexto `system`) crea la tarea `review_renewal_request` (`dedupe_key = request:<id>`, prioridad alta, vence en 2 días) y notificaciones `in_app` + `email` para el responsable de la suscripción (o del cliente, o admins).

## 8. Contenido del correo

- Plantillas en `infrastructure/email/templates/` (texto + HTML simple), en español, con: cliente, producto, fecha de vencimiento (formato `d 'de' MMMM 'de' yyyy`), días restantes, regla, enlace a `FRONTEND_URL/subscriptions/<id>`.
- Sin precio ni costo en el correo (minimizar datos sensibles en buzones).
- Remitente `EMAIL_FROM` en dominio verificado en Resend.

## 9. Observabilidad

Métricas derivadas (ver `docs/observability.md`): pendientes vencidas > 15 min, `failed` en 24 h, edad del último `dispatch` exitoso. El dashboard interno muestra un aviso si hay alertas `failed`.
