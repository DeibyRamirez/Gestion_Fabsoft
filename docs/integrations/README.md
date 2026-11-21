# Integraciones externas — FabSoft API v1

> Contrato completo: `docs/api/openapi.yaml` (UI navegable: `GET /api/v1/docs`). Autenticación: ADR-001. Permisos: `docs/security/permissions-matrix.md`.

## 1. Modelo

Cada aplicación externa es una **integración** con identidad propia (`app.integrations`), nunca un usuario humano. Su configuración se declara en un **manifest JSON versionado** que el servidor valida, persiste (`integrations.manifest`, `manifest_version`) y audita.

| Campo del manifest | Efecto en el sistema |
|---|---|
| `integration` | `integrations.slug` (único, inmutable). |
| `version` | `integrations.manifest_version`; cada sustitución exige semver **estrictamente mayor**. |
| `display_name`, `description` | `integrations.name`, `description`. |
| `scopes` | `integrations.scopes` (lista blanca, ver §2). |
| `client_scope` | `all` = todos los clientes; `own` = sólo los de `client_ids` (`app.integration_clients`). |
| `client_ids` | Obligatorio si `own` (≥1, todos deben existir y no estar archivados). Prohibido si `all`. |
| `rate_limit_per_minute` | Límite por integración (por defecto 60). |
| `credential_ttl_days` | Caducidad por defecto de las API keys emitidas (`api_credentials.expires_at`). |

- Esquema formal: [`integration-manifest.schema.json`](./integration-manifest.schema.json) (JSON Schema 2020-12). El backend aplica el equivalente Zod (`IntegrationManifestSchema` de `@fabsoft/shared`) más reglas semánticas (existencia de `client_ids`, semver creciente, slug inmutable).
- Ejemplo: [`example-integration.json`](./example-integration.json).
- Las claves del manifest usan `snake_case` (documento de configuración, como en el ejemplo del contexto técnico); el resto de la API usa `camelCase`.
- Convención del repositorio: un archivo `docs/integrations/<slug>.json` por integración real, revisado por PR antes de aplicarlo con `PUT /api/v1/integrations/{id}/manifest`.

## 2. Scopes

| Scope | Operaciones |
|---|---|
| `clients:read` | `GET /api/v1/clients`, `GET /api/v1/clients/{id}` |
| `products:read` | `GET /api/v1/products`, `GET /api/v1/products/{id}` |
| `subscriptions:read` | `GET /api/v1/subscriptions`, `GET /api/v1/subscriptions/{id}`, `GET /api/v1/subscriptions/expiring`, `GET /api/v1/subscriptions/{id}/periods` |
| `renewal-tasks:read` | `GET /api/v1/renewal-tasks`, `GET /api/v1/renewal-tasks/{id}` |
| `renewal-requests:read` | `GET /api/v1/renewal-requests`, `GET /api/v1/renewal-requests/{id}` |
| `renewal-requests:write` | `POST /api/v1/renewal-requests` (requiere además `subscriptions:read` para validar la suscripción) |

Ninguna otra operación de escritura está disponible para integraciones en el MVP (§6.9: "no se debe permitir que una integración cree o cambie cualquier recurso por defecto"). Nuevos scopes requieren caso de uso real, cambio en la lista blanca (`integrations_scopes_valid`), OpenAPI y este documento.

## 3. Ciclo de vida (Flujo D)

1. **Admin** crea la integración: `POST /api/v1/integrations` con `{ "manifest": { ... } }` → `integration.created` en auditoría.
2. **Admin** emite credencial: `POST /api/v1/integrations/{id}/credentials` → respuesta con `apiKey` **una sola vez** (`Cache-Control: no-store`). Se entrega a la aplicación externa por canal seguro (gestor de secretos compartido; nunca por correo o chat en claro).
3. La aplicación llama a la API con `X-Api-Key`; el middleware verifica HMAC, vigencia, estado de la integración y scopes.
4. Cambios de permisos: nuevo manifest con versión mayor → `PUT /api/v1/integrations/{id}/manifest` → `integration.manifest_updated` con diff.
5. Rotación: emitir segunda credencial (máx. 2 activas) → la aplicación la despliega → `POST .../credentials/{credentialId}/revoke` de la anterior.
6. Baja: `PATCH /api/v1/integrations/{id}` con `status: "deshabilitada"` (corte inmediato; no se borra).

## 4. Uso

### Consultar vencimientos (30 días)

```bash
curl -s https://api.fabsoft.example/api/v1/subscriptions/expiring?withinDays=30\&page=1\&pageSize=50 \
  -H "X-Api-Key: $FABSOFT_API_KEY"
```

```json
{
  "data": [
    {
      "id": "8b1d…",
      "client": { "id": "3f9a2c1e-…", "legalName": "Comercializadora Andina S.A.S." },
      "product": { "id": "51c0…", "name": "Microsoft 365 Business Standard" },
      "startDate": "2025-11-15",
      "currentPeriodEnd": "2026-11-14",
      "daysUntilExpiration": 13,
      "billingCycle": "annual",
      "priceAmount": "1850000.00",
      "currency": "COP",
      "status": "en_renovacion",
      "followUpStatus": "en_gestion",
      "currentPaymentStatus": "pendiente",
      "isRenewable": true,
      "owner": { "id": "…", "fullName": "Operador Demo" },
      "version": 4
    }
  ],
  "meta": { "page": 1, "pageSize": 50, "total": 1, "totalPages": 1, "today": "2026-11-01", "withinDays": 30 }
}
```

### Registrar una solicitud de renovación (idempotente)

```bash
curl -s -X POST https://api.fabsoft.example/api/v1/renewal-requests \
  -H "X-Api-Key: $FABSOFT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 2b7f6c0e-5d1a-4c3b-9e8f-0a1b2c3d4e5f" \
  -d '{"subscriptionId":"8b1d…","comment":"El cliente pidió renovar por 12 meses desde el ERP"}'
```

- `201` con la solicitud en `pendiente_revision`. Repetir con la misma clave y cuerpo devuelve la misma respuesta con `Idempotency-Replayed: true`.
- Una solicitud **no** es una renovación confirmada ni implica pago (RN-05, RN-06).

## 5. Errores y límites

- Formato `application/problem+json` con `code` estable: `unauthenticated` (clave ausente/revocada/expirada o integración desactivada), `insufficient_scope`, `not_found` (también para recursos fuera de alcance), `validation_error`, `idempotency_key_reused`, `idempotency_in_progress`, `rate_limited`.
- Límite: `rate_limit_per_minute` por integración (ventana fija de 60 s en cada instancia de API). Cabeceras `RateLimit`/`RateLimit-Policy`; al exceder, `429` + `Retry-After`. Reintentar con backoff exponencial y **la misma** `Idempotency-Key`.
- Paginación `page`/`pageSize` (≤100). Iterar hasta `page = totalPages`.

## 6. Auditoría y datos

- Lecturas: logs JSON del API (con `integrationId`, ruta, estado y latencia cuando se instrumente). Escrituras: `audit_logs` con `actor_type='integration'`.
- Las integraciones nunca reciben `supplierCostAmount` ni notas internas.

## 7. Futuro (no MVP)

Webhooks (sólo si aparece un consumidor real, §6.9) y OAuth2 *client credentials*. Requieren ADR.

## 8. Pruebas manuales de una integración

### 8.1 Para qué sirve el módulo

El módulo de integraciones permite que un CRM, ERP, mesa de ayuda o cualquier sistema externo consulte clientes, productos, suscripciones, tareas y solicitudes **sin conectarse a PostgreSQL**. Cada integración tiene:

- identidad propia (no usa el usuario de una persona),
- API keys con hash HMAC y revocación,
- scopes mínimos,
- alcance de clientes (`all` u `own`),
- rate limit,
- idempotencia en escrituras,
- auditoría de sus operaciones.

No es un webhook ni un conector específico con Microsoft/Google: es una **API REST de solo lectura + creación de solicitudes de renovación** para sistemas externos.

### 8.2 Crear la integración en local

1. Levanta API (`pnpm --filter @fabsoft/backend dev`), frontend (`pnpm --filter @fabsoft/frontend dev`) y la base local.
2. Entra como admin a `http://localhost:3000/admin/integrations`.
3. Crea una integración con un manifest como este:

```json
{
  "manifest_schema_version": 1,
  "integration": "crm-acme",
  "version": "1.0.0",
  "display_name": "CRM Acme",
  "description": "Prueba de integración externa",
  "scopes": [
    "clients:read",
    "subscriptions:read",
    "renewal-requests:read",
    "renewal-requests:write"
  ],
  "client_scope": "all",
  "rate_limit_per_minute": 60
}
```

4. Abre el detalle de la integración y emite una credencial. La API key se muestra **una sola vez**; guárdala en una variable de entorno, nunca en el repositorio.

### 8.3 Consumir la API como sistema externo

PowerShell:

```powershell
$env:FABSOFT_API_KEY = 'fsk_test_...'
$base = 'http://localhost:4000/api/v1'

curl.exe -s "$base/subscriptions/expiring?withinDays=30&page=1&pageSize=50" `
  -H "X-Api-Key: $env:FABSOFT_API_KEY"
```

Bash:

```bash
export FABSOFT_API_KEY='fsk_test_...'
curl -s "http://localhost:4000/api/v1/subscriptions/expiring?withinDays=30&page=1&pageSize=50" \
  -H "X-Api-Key: $FABSOFT_API_KEY"
```

Reglas de autenticación:

- Usa **solo** `X-Api-Key`; no envíes `Authorization: Bearer` en la misma petición.
- La API key no es un usuario humano y no sirve para rutas de administración.
- Si la integración está `deshabilitada`, la key está revocada o expiró, la respuesta es `401 unauthenticated`.
- Si falta un scope, la respuesta es `403 insufficient_scope`.

### 8.4 Matriz mínima de pruebas

| Caso | Acción | Resultado esperado |
|---|---|---|
| Lectura permitida | `GET /clients` con `clients:read` | `200` con solo los clientes del alcance |
| Scope faltante | Quitar `clients:read` del manifest y repetir | `403 insufficient_scope` |
| Alcance `own` | Manifest con `client_scope=own` y `client_ids` | Solo esos clientes; otro id ⇒ `404` |
| Key inválida | Enviar `X-Api-Key` incorrecta | `401 unauthenticated` |
| Key revocada | Revocar credencial y repetir | `401 unauthenticated` |
| Integración deshabilitada | `PATCH /integrations/{id}` con `status: "deshabilitada"` | `401` en todas las rutas |
| Rate limit | Superar `rate_limit_per_minute` | `429 rate_limited` + `Retry-After` |
| Idempotencia | Repetir `POST /renewal-requests` con la misma `Idempotency-Key` y cuerpo | Misma respuesta, `Idempotency-Replayed: true` |
| Idempotencia reusable | Misma key con cuerpo distinto | `422 idempotency_key_reused` |
| Auditoría | Consultar `GET /audit-logs?actorType=integration` | Evento de la integración |
| Datos internos | Revisar una suscripción devuelta | Sin `supplierCostAmount` ni `notes` |

### 8.5 Simular un sistema externo real

Para una prueba de concepto puedes usar Postman, Insomnia o un script Node:

```js
const base = 'http://localhost:4000/api/v1';
const res = await fetch(`${base}/subscriptions/expiring?withinDays=30`, {
  headers: { 'X-Api-Key': process.env.FABSOFT_API_KEY },
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
console.log(await res.json());
```

Para probar desde otra máquina o desde un sistema externo real:

1. Despliega la API en un entorno accesible por HTTPS (staging/VPS).
2. Crea la integración allí y emite una key de ese entorno.
3. Configura el sistema externo con la URL base y la key en su gestor de secretos.
4. Verifica firewall/TLS; el consumo es servidor-a-servidor, no depende de CORS.
5. Si el sistema externo necesita reaccionar a cambios sin consultar, eso requiere webhooks: **no están implementados en el MVP**.

### 8.6 Limitaciones actuales

- No hay webhooks ni suscripciones push.
- No hay OAuth2 *client credentials*; se usa API key.
- El rate limit se aplica en memoria por instancia de API; con varias réplicas cada una tiene su propia ventana.
- Las integraciones no pueden cancelar, renovar ni modificar suscripciones; solo crear solicitudes de renovación.
- Las lecturas no reemplazan la auditoría de negocio; las escrituras sí quedan en `audit_logs`.
