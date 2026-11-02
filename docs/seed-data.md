# Datos de prueba (seed) — FabSoft

> **Sólo dev y staging.** El script aborta si `APP_ENV=prod` o si `DATABASE_MIGRATION_URL` apunta a un host listado en `SEED_FORBIDDEN_HOSTS`. Ningún dato real de clientes se usa fuera de producción.

## 1. Ejecución

```bash
pnpm db:migrate            # dbmate up (incluye alert_rules y app_settings de referencia)
pnpm db:seed               # = pnpm --filter @fabsoft/backend exec tsx scripts/seed.ts
pnpm db:seed --reset       # TRUNCATE ... CASCADE de las tablas de app (excepto alert_rules y app_settings) y vuelve a sembrar
```

- `backend/scripts/seed.ts` se conecta con `DATABASE_MIGRATION_URL` (rol propietario) para insertar sin pasar por RLS y reutiliza los adaptadores reales `Argon2PasswordHasher` y `HmacApiKeyHasher` (los hashes son idénticos a los que generaría la app).
- Es **idempotente**: usa UUID fijos (`00000000-0000-4000-8000-0000000000xx`) y `on conflict do nothing`.
- Las fechas se calculan **relativas a hoy en America/Bogota** (`hoy`), de modo que las alertas D30…POST1 siempre tengan casos.
- Después de sembrar ejecuta `alerts.reconcile` en línea (mismo caso de uso que el worker) para generar las `notifications` futuras.
- Imprime al final las credenciales de desarrollo y la API key de prueba (sólo existe en esa salida).

## 2. Usuarios

| Email | Rol | Cliente | Contraseña dev | `must_change_password` |
|---|---|---|---|---|
| `admin@fabsoft.test` | `admin` | — | `Admin.dev-2026!` | `false` |
| `operador@fabsoft.test` | `operator` | — | `Operador.dev-2026!` | `false` |
| `portal@andina.test` | `client` | Distribuidora Andina S.A.S. | `Cliente.dev-2026!` | `false` |
| `portal@cafetal.test` | `client` | Café El Cafetal Ltda. | `Cliente.dev-2026!` | `true` (prueba del cambio obligatorio) |
| `inactivo@fabsoft.test` | `operator` (`status=disabled`) | — | `Inactivo.dev-2026!` | `false` |

El dominio `.test` es reservado: los correos nunca se entregan (y en dev `EMAIL_TRANSPORT=log`).

## 3. Clientes

| Cliente | NIT (`tax_id`) | Estado | Responsable | Contactos |
|---|---|---|---|---|
| Distribuidora Andina S.A.S. | `900.123.456-7` | `active` | admin | 2 (uno principal) |
| Café El Cafetal Ltda. | `800.987.654-3` | `active` | operador | 1 |
| Clínica Norte S.A. | `901.555.222-1` | `active` | operador | 1 |
| Ferretería Los Andes | sin NIT | `inactive` | — | 0 |
| Textiles Antiguos S.A.S. | `830.111.000-9` | `archived` | — | 0 |

Además: dos `client_notes` en Andina y una en Clínica Norte. Para probar el duplicado (RN-01/`409 duplicate_tax_id`) intentar crear un cliente con NIT `900123456-7`.

## 4. Productos

| Producto | `product_type` | Proveedor | Estado |
|---|---|---|---|
| Microsoft 365 Business Standard | `third_party` | Microsoft | `active` |
| Antivirus ESET Protect Entry | `third_party` | ESET | `active` |
| FabSoft Facturación | `own` | FabSoft | `active` |
| Soporte técnico mensual | `recurring_service` | FabSoft | `active` |
| Hosting compartido básico | `recurring_service` | FabSoft | `inactive` (no seleccionable al crear suscripciones) |

## 5. Suscripciones (fechas relativas a `hoy`)

`current_period_end` es el último día **inclusivo**. Importes en COP.

| # | Cliente | Producto | Ciclo | Fin del periodo actual | `status` | `follow_up_status` | Pago periodo actual | Propósito |
|---|---|---|---|---|---|---|---|---|
| S1 | Andina | Microsoft 365 | `annual` | `hoy + 30` | `active` | `none` | `received` | Alerta D30 hoy |
| S2 | Andina | ESET | `annual` | `hoy + 15` | `in_renewal` | `in_progress` | `received` | D15; tarea `contact_client` abierta; solicitud de renovación `pending_review` creada por `portal@andina.test` |
| S3 | Cafetal | FabSoft Facturación | `annual` | `hoy + 7` | `active` | `awaiting_client` | `pending` | D7; pago pendiente |
| S4 | Cafetal | Soporte técnico | `monthly` | `hoy + 1` | `active` | `none` | `not_tracked` | D1 |
| S5 | Clínica Norte | Microsoft 365 | `annual` | `hoy` | `in_renewal` | `in_progress` | `received` | D0 (vence hoy, aún vigente) |
| S6 | Clínica Norte | ESET | `annual` | `hoy - 1` | `expired` | `none` | `received` | POST1; tarea `review_expired` |
| S7 | Clínica Norte | Soporte técnico | `monthly` | `hoy - 20` | `not_renewed` | `closed` | `received` | Periodo con `renewal_outcome=not_renewed` y motivo |
| S8 | Andina | Soporte técnico | `quarterly` | `hoy + 75` | `active` | `none` | `received` | Renovada: **3 periodos** en historial (RN-04) |
| S9 | Cafetal | ESET | `annual` | `hoy + 340` | `pending_activation` | `none` | `pending` | Pendiente de activación |
| S10 | Ferretería Los Andes | FabSoft Facturación | `annual` | `hoy - 90` | `cancelled` | `closed` | `received` | Cancelada por admin con motivo |
| S11 | Andina | FabSoft Facturación | `custom` (18 meses) | `hoy + 200` | `active` | `none` | `received` | Ciclo personalizado; `visible_in_portal=false` (no aparece en portal) |

Notas:
- Cada suscripción tiene sus `subscription_periods` coherentes (sin solapes; el último periodo termina en `current_period_end`).
- S2 y S5 tienen `supplier_cost_amount` para comprobar que no se exponen al portal ni a integraciones (`T-SEC-05`).
- S6/S10 permiten comprobar que no hay borrado físico y que la auditoría registra el cambio.

## 6. Tareas, notificaciones y auditoría

- `tasks`: las generadas por las reglas para S1 (`send_proposal`), S2 (`contact_client`), S6 (`review_expired`), más una tarea manual completada en S8.
- `notifications`: tras `alerts.reconcile`, pendientes las futuras de S1…S5 y S8; en dev con `EMAIL_TRANSPORT=log` el worker las marca `sent` y escribe el correo en el log.
- `audit_logs`: el seed escribe una entrada `seed.executed` con `actor_type='system'`; los registros sembrados no generan auditoría individual.

## 7. Integración de prueba

| Campo | Valor |
|---|---|
| Integración | `erp-contable` (manifest = `docs/integrations/example-integration.json`, con `client_ids` sustituidos por los UUID de Andina y Cafetal) |
| Scopes | `subscriptions:read`, `renewal-requests:write` |
| Alcance | `own` → Andina, Cafetal (Clínica Norte **no** visible: prueba de aislamiento) |
| Credencial | `fsk_test_seed0001_<secreto>` impresa por el script; `expires_at = hoy + 365` |

Prueba rápida:
```bash
curl -H "X-Api-Key: $FABSOFT_API_KEY" "http://localhost:4000/api/v1/subscriptions?pageSize=20"   # S1–S4, S8, S9 (S11 incluida: visible_in_portal sólo afecta al portal)
```
