# Reglas de negocio — FabSoft

> Fuente: documento funcional §8 (15 reglas). Identificadores **RN-01 … RN-16** en el mismo orden que el §8. Cada regla indica dónde se hace cumplir y los tests que la verifican (rutas relativas a `backend/tests/` o colocalizados `*.test.ts` en `backend/src/`). Ningún PR que toque una regla se aprueba sin su test.

## Tabla de equivalencias

| ID | Funcional §8 | Contexto técnico §2.3 (viñeta) | Criterios de aceptación §10 relacionados |
|---|---|---|---|
| RN-01 | 8.1 Suscripción pertenece a un cliente y referencia un producto | 1 | "registrar productos y suscripciones" |
| RN-02 | 8.2 Un producto puede tener muchas suscripciones | 2 | — |
| RN-03 | 8.3 Fecha de vencimiento = fin del periodo vigente, convención consistente | — (implícita) | "cada suscripción tiene fecha de vencimiento" |
| RN-04 | 8.4 Periodos anteriores no se sobrescriben | 3 | "una renovación conserva el periodo anterior" |
| RN-05 | 8.5 Solicitud ≠ renovación confirmada | 4 | "un cliente puede solicitar una renovación" |
| RN-06 | 8.6 Renovación confirmada ≠ pago recibido | 4 | — |
| RN-07 | 8.7 Vigencia, pago y seguimiento separados | 5 | "identificar activas, próximas, vencidas o canceladas" |
| RN-08 | 8.8 Alertas idempotentes | 6 | "genera alertas sin duplicarlas" |
| RN-09 | 8.9 Cambios de fechas/periodicidad/estado revisan alertas y tareas | 7 | "errores al enviar alertas no hacen perder el registro" (parcial) |
| RN-10 | 8.10 Canceladas/no renovables no generan alertas (salvo excepción) | 8 | — |
| RN-11 | 8.11 Cliente sólo ve su organización y campos autorizados | 9 | "el portal muestra únicamente la información autorizada" |
| RN-12 | 8.12 Integraciones sólo operan dentro de sus permisos | 10 | "la API impide accesos no autorizados" |
| RN-13 | 8.13 Cambios sensibles auditados | 11 | "los cambios sensibles quedan auditados" |
| RN-14 | 8.14 No eliminar físicamente registros históricos | 12 | — |
| RN-15 | 8.15 Lógica de negocio en servidor | 13 | "la API impide accesos no autorizados" |
| RN-16 | Añadida por PO (no está en §8) | — | Cada cliente tiene exactamente un contacto principal |

> Nomenclatura de tests: `T-RNxx-nn`. Otros prefijos usados en la documentación: `T-AUTH-*`, `T-API-*`, `T-SEC-*`, `T-NOT-*`, `T-INT-*`, `T-FE-*` (ver `docs/testing-strategy.md`).

---

### RN-01 — Una suscripción pertenece a un cliente y referencia un producto
- **Cumplimiento:** `subscriptions.client_id` y `product_id` `NOT NULL` + FK; caso de uso `CreateSubscription` exige cliente no archivado (`422 client_archived`) y producto activo (`422 product_inactive`). El cliente y el producto no se cambian tras crear (no están en `SubscriptionUpdate`).
- **Tests:**
  - `T-RN01-01` (integración) insertar sin cliente/producto falla por constraint.
  - `T-RN01-02` (unit, caso de uso) crear con cliente archivado ⇒ `client_archived`; con producto inactivo ⇒ `product_inactive`.
  - `T-RN01-03` (API) `PATCH /subscriptions/{id}` con `clientId` ⇒ `400 validation_error` (propiedad no permitida).

### RN-02 — Un producto puede tener muchas suscripciones
- **Cumplimiento:** sin unicidad sobre `subscriptions.product_id`; el catálogo no guarda precios ni fechas (§6.3).
- **Tests:**
  - `T-RN02-01` (integración) crear dos suscripciones del mismo producto para clientes distintos y para el mismo cliente.
  - `T-RN02-02` (API) `GET /subscriptions?productId=` devuelve ambas.

### RN-03 — El vencimiento es el fin del periodo vigente con convención consistente
- **Convención:** `current_period_end` es el **último día inclusivo** de vigencia en **America/Bogota**; vencida ⇔ `hoy_bogota > current_period_end`; siguiente periodo empieza `end + 1 día`.
- **Cumplimiento:** `domain/subscriptions/billing-cycle.ts`, `Clock` de negocio; invariante `current_period_end = max(subscription_periods.end_date)`.
- **Tests:**
  - `T-RN03-01` (unit) cálculo de fin para cada `billing_cycle`, fin de mes (31-ene mensual ⇒ 28/29-feb) y año bisiesto.
  - `T-RN03-02` (integración) tras crear, renovar y corregir, la invariante se mantiene.
  - `T-RN03-03` (unit) con `FixedClock` a las 23:30 del día de vencimiento (hora Bogotá = 04:30 UTC del día siguiente) la suscripción **no** está vencida; a las 00:05 del día siguiente sí.

### RN-04 — Los periodos anteriores no se sobrescriben al renovar
- **Cumplimiento:** `RenewSubscription` inserta un periodo nuevo; trigger `tg_subscription_periods_guard` bloquea cambios de fechas/precio/ciclo en periodos y de `end_date` salvo en el último; sin solapes.
- **Tests:**
  - `T-RN04-01` (integración) renovar con precio distinto: el periodo 1 conserva su precio y fechas; el 2 tiene los nuevos.
  - `T-RN04-02` (integración/BD) `UPDATE subscription_periods SET price_amount=...` ⇒ error `P0001`; cambiar `end_date` de un periodo no vigente ⇒ error.
  - `T-RN04-03` (integración/BD) insertar periodo solapado ⇒ error `23P01`.

### RN-05 — Una solicitud de renovación no equivale a una renovación confirmada
- **Cumplimiento:** `renewal_requests` es entidad separada; crearla no cambia `subscriptions.status`, `current_period_end` ni periodos. `resolve` con `renewed` exige periodo renovado confirmado posterior a la solicitud (`422 renewal_not_confirmed`).
- **Tests:**
  - `T-RN05-01` (integración) crear solicitud desde portal: suscripción y periodos sin cambios; solicitud `pending_review`; el worker crea tarea `review_renewal_request`.
  - `T-RN05-02` (unit) resolver `renewed` sin renovación ⇒ `renewal_not_confirmed`.

### RN-06 — Una renovación confirmada no implica pago recibido
- **Cumplimiento:** nuevo periodo con `payment_status='pending'` (o `not_tracked`); `RenewInput.newPeriod.paymentStatus` no admite `received`; sólo `PATCH .../periods/{periodId}` cambia el pago.
- **Tests:**
  - `T-RN06-01` (unit) `renew()` nunca produce `received`.
  - `T-RN06-02` (API) `POST /subscriptions/{id}/renew` con `paymentStatus: "received"` ⇒ `400`.

### RN-07 — Vigencia, pago y seguimiento se modelan por separado
- **Cumplimiento:** `subscriptions.status` (vigencia), `subscription_periods.payment_status` (pago), `subscriptions.follow_up_status` + `renewal_outcome` + `renewal_requests.status` (seguimiento). El job de vencimiento no lee pago; cambiar el pago no cambia vigencia.
- **Tests:**
  - `T-RN07-01` (integración) marcar pago `received` en una suscripción vencida no la reactiva; vencer una con pago `pending` no altera el pago.
  - `T-RN07-02` (unit) la máquina de estados de vigencia no tiene entradas dependientes del pago.

### RN-08 — Alertas idempotentes
- **Cumplimiento:** `notifications.dedupe_key` único (`exp:<sub>:<regla>:<period_end>:<canal>:<destinatario>`); inserción `ON CONFLICT DO NOTHING`; tareas automáticas con `tasks.dedupe_key`; `Idempotency-Key` de Resend = `dedupe_key`.
- **Tests:**
  - `T-RN08-01` (integración) ejecutar `alerts.reconcile` 3 veces ⇒ mismo número de notificaciones.
  - `T-RN08-02` (integración) dos workers concurrentes despachando ⇒ cada notificación enviada una vez (`SKIP LOCKED`).
  - `T-RN08-03` (unit) reintento tras caída post-envío usa la misma `Idempotency-Key`.

### RN-09 — Al modificar fechas, periodicidad o estado se revisan alertas y tareas
- **Cumplimiento:** `CorrectExpiration`, `RenewSubscription`, `CancelSubscription`, `MarkNotRenewed`, `UpdateSubscription` (`isRenewable`) invocan `AlertSchedulingRepository.cancelPendingForPeriod` + `scheduleForPeriod` y `RenewalTaskRepository.closeOrCancelAutoTasks` en la misma transacción.
- **Tests:**
  - `T-RN09-01` (integración) corregir vencimiento: alertas `pending` del antiguo `period_end` ⇒ `cancelled` (`period_end_changed`); nuevas creadas para la nueva fecha.
  - `T-RN09-02` (integración) renovar: tareas automáticas abiertas del periodo anterior cerradas y solicitudes abiertas resueltas.
  - `T-RN09-03` (integración) cancelar: todas las alertas pendientes `cancelled` y tareas abiertas `cancelled`.

### RN-10 — Canceladas o no renovables no generan alertas de renovación (salvo excepción)
- **Cumplimiento:** el planificador excluye `status IN ('cancelled','not_renewed')` siempre, y `is_renewable=false` o `renewal_outcome='not_renewed'` salvo reglas con `applies_when_not_renewable=true`; el dispatcher revalida antes de enviar.
- **Tests:**
  - `T-RN10-01` (integración) suscripción cancelada ⇒ 0 notificaciones nuevas en reconcile.
  - `T-RN10-02` (integración) `is_renewable=false` + regla `D0` con excepción ⇒ sólo `D0`.
  - `T-RN10-03` (integración) notificación pendiente cuya suscripción se cancela antes de enviarse ⇒ el dispatcher la marca `cancelled`, no la envía.

### RN-11 — El cliente sólo ve su organización y los campos autorizados
- **Cumplimiento:** rutas `/portal/*` con proyecciones `Portal*`; `clientId` siempre del contexto (nunca de la petición); RLS `client_id = app.ctx_client_id()` y `visible_in_portal`; recursos ajenos ⇒ 404.
- **Tests:**
  - `T-RN11-01` (seguridad/API) cliente A pide suscripción, periodos y solicitud de B ⇒ 404; listados sólo contienen A.
  - `T-RN11-02` (API) el cliente no tiene endpoint para cambiar fechas, precio, proveedor, pago ni confirmar renovación (rutas internas ⇒ 403).
  - `T-RN11-03` (contrato) respuestas del portal no contienen `supplierCostAmount`, `notes`, `owner`, `paymentStatus`.
  - `T-RN11-04` (RLS) consulta directa con contexto de cliente A no devuelve filas de B (suite `rls-isolation`).

### RN-12 — Las integraciones sólo realizan operaciones cubiertas por sus permisos
- **Cumplimiento:** `requireScope` por ruta (declarado en OpenAPI), `client_scope` + `integration_clients` en aplicación y RLS, rutas sin `apiKeyAuth` rechazan API keys, rate limit por integración.
- **Tests:**
  - `T-RN12-01` (seguridad) integración `own` no ve clientes fuera de alcance (404) ni los incluye en listados.
  - `T-RN12-02` (API) sin `renewal-requests:write` ⇒ 403 `insufficient_scope`; con scope crea solicitud auditada con `actor_type='integration'`.
  - `T-RN12-03` (API, generado desde `openapi.yaml`) toda operación sin `apiKeyAuth` responde 401/403 a una API key válida.

### RN-13 — Los cambios sensibles quedan auditados
- **Cumplimiento:** `AuditWriter` en la misma transacción; acciones mínimas: `client.created|updated|archived|reactivated`, `subscription.created|updated|activated|renewal_started|renewed|not_renewed|cancelled|expiration_corrected|price_changed|expired`, `subscription_period.payment_updated`, `renewal_request.created|updated|resolved`, `task.created|updated|completed|cancelled`, `user.created|updated|role_changed|disabled|password_reset`, `integration.created|updated|manifest_updated|disabled`, `api_credential.created|revoked`, `alert_rule.updated`, `app_setting.updated`, `notification.retried`, `auth.login_failed|refresh_reuse_detected`. Sin secretos (redacción).
- **Tests:**
  - `T-RN13-01` (integración) cada caso de uso listado escribe exactamente un evento con actor, recurso, `before/after`.
  - `T-RN13-02` (integración) si la escritura de auditoría falla, la operación hace rollback.
  - `T-RN13-03` (unit) `AuditWriter` elimina `password`, `passwordHash`, `apiKey`, `keyHash`, `token*`.

### RN-14 — No eliminar físicamente registros necesarios para historial o auditoría
- **Cumplimiento:** sin endpoints DELETE para entidades de negocio; `REVOKE DELETE` + trigger `tg_prevent_delete`; archivado/estados terminales.
- **Tests:**
  - `T-RN14-01` (BD) `DELETE` en cada tabla histórica falla también como propietario.
  - `T-RN14-02` (API, generado desde spec) el spec no declara operaciones `delete` sobre recursos de negocio.
  - `T-RN14-03` (integración) archivar cliente conserva suscripciones, periodos y auditoría consultables.

### RN-15 — La lógica de negocio se ejecuta en el servidor
- **Cumplimiento:** validación Zod en servidor para toda entrada; transiciones de estado sólo en `domain`; autorización en middleware + caso de uso + RLS; el frontend sólo reutiliza esquemas para UX.
- **Tests:**
  - `T-RN15-01` (API) peticiones directas (sin frontend) con datos inválidos o transiciones ilegales ⇒ `400`/`422`.
  - `T-RN15-02` (arquitectura) `frontend/` no importa nada de `backend/`; `@fabsoft/shared` no contiene reglas de autorización.

### RN-16 — Cada cliente tiene exactamente un contacto principal
Regla añadida por el Product Owner (no figura en el §8 funcional).
- **Cumplimiento:** índice único parcial `client_contacts (client_id) WHERE is_primary AND archived_at IS NULL`; el caso de uso que marca un contacto como principal desmarca el anterior en la misma transacción; no se puede archivar el contacto principal sin designar otro.
- **Tests:** `T-RN16-01` dos principales para un cliente fallan; `T-RN16-02` cambiar el principal deja exactamente uno; `T-RN16-03` archivar el principal sin reemplazo devuelve 409.
