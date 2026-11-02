# Integraciones externas — FabSoft API v1

> Contrato completo: `docs/api/openapi.yaml`. Autenticación: ADR-001. Permisos: `docs/security/permissions-matrix.md`.

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

- Esquema formal: [`integration-manifest.schema.json`](./integration-manifest.schema.json) (JSON Schema 2020-12). El backend aplica el equivalente Zod (`@fabsoft/shared/integrations/manifest.ts`) más reglas semánticas (existencia de `client_ids`, semver creciente, slug inmutable).
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
| `renewal-requests:write` | `POST /api/v1/renewal-requests` |

Ninguna otra operación de escritura está disponible para integraciones en el MVP (§6.9: "no se debe permitir que una integración cree o cambie cualquier recurso por defecto"). Nuevos scopes requieren caso de uso real, cambio en la lista blanca (`integrations_scopes_valid`), OpenAPI y este documento.

## 3. Ciclo de vida (Flujo D)

1. **Admin** crea la integración: `POST /api/v1/integrations` con `{ "manifest": { ... } }` → `integration.created` en auditoría.
2. **Admin** emite credencial: `POST /api/v1/integrations/{id}/credentials` → respuesta con `apiKey` **una sola vez** (`Cache-Control: no-store`). Se entrega a la aplicación externa por canal seguro (gestor de secretos compartido; nunca por correo o chat en claro).
3. La aplicación llama a la API con `X-Api-Key`.
4. Cambios de permisos: nuevo manifest con versión mayor → `PUT /api/v1/integrations/{id}/manifest` → `integration.manifest_updated` con diff.
5. Rotación: emitir segunda credencial (máx. 2 activas) → la aplicación la despliega → `POST .../credentials/{credentialId}/revoke` de la anterior.
6. Baja: `PATCH /api/v1/integrations/{id}` con `status: "disabled"` (corte inmediato; no se borra).

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
      "status": "in_renewal",
      "followUpStatus": "in_progress",
      "currentPaymentStatus": "pending",
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

- `201` con la solicitud en `pending_review`. Repetir con la misma clave y cuerpo devuelve la misma respuesta con `Idempotency-Replayed: true`.
- Una solicitud **no** es una renovación confirmada ni implica pago (RN-05, RN-06).

## 5. Errores y límites

- Formato `application/problem+json` con `code` estable: `unauthenticated` (clave ausente/revocada/expirada o integración desactivada), `insufficient_scope`, `not_found` (también para recursos fuera de alcance), `validation_error`, `idempotency_key_reused`, `idempotency_in_progress`, `rate_limited`.
- Límite: `rate_limit_per_minute` por integración (ventana deslizante de 60 s). Cabeceras `RateLimit`/`RateLimit-Policy`; al exceder, `429` + `Retry-After`. Reintentar con backoff exponencial y **la misma** `Idempotency-Key`.
- Paginación `page`/`pageSize` (≤100). Iterar hasta `page = totalPages`.

## 6. Auditoría y datos

- Lecturas: log de acceso (`pino-http`, con `integrationId`, ruta, estado, latencia). Escrituras: `audit_logs` con `actor_type='integration'`.
- Las integraciones nunca reciben `supplierCostAmount` ni notas internas.

## 7. Futuro (no MVP)

Webhooks (sólo si aparece un consumidor real, §6.9) y OAuth2 *client credentials*. Requieren ADR.
