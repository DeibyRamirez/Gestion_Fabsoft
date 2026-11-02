# ADR-002 — REST versionado (`/api/v1`) en lugar de GraphQL

- **Estado:** Aceptada
- **Fecha:** 2026-11-01

## Contexto

El documento funcional (§6.9) pide una API versionada (por ejemplo `/api/v1`) con endpoints concretos, paginación, filtros, errores consistentes, límites de consumo, idempotencia y documentación. Los consumidores son 2–5 usuarios internos, el portal de clientes y un puñado de integraciones. El contexto técnico (§3, §4) descarta GraphQL.

## Decisión

- API **REST JSON** bajo el prefijo **`/api/v1`**, documentada en **OpenAPI 3.1** (`docs/api/openapi.yaml`), generada/contrastada desde los esquemas Zod con `@asteasolutions/zod-to-openapi`.
- Recursos en plural y kebab-case: `/clients`, `/products`, `/subscriptions`, `/renewal-requests`, `/renewal-tasks`, `/notifications`, `/alert-rules`, `/integrations`, `/audit-logs`, `/users`, `/dashboard`, `/portal/*`, `/auth/*`.
- Transiciones de estado con **sub-recursos de acción** explícitos (`POST /subscriptions/{id}/renew`, `/cancel`, `/correct-expiration`, ...), nunca con `PATCH status` libre: cada transición es un caso de uso con reglas y auditoría propias.
- Convenciones:
  - JSON en `camelCase`; fechas de negocio `YYYY-MM-DD`; instantes ISO-8601 UTC; importes como string decimal (`"1200000.00"`) con `currency: "COP"`.
  - Paginación por página: `page` (≥1), `pageSize` (1–100, por defecto 20) → `{ data: [...], meta: { page, pageSize, total, totalPages } }`.
  - Ordenación `sort=campo` o `sort=-campo` sobre una lista blanca por recurso.
  - Errores **RFC 9457** (`application/problem+json`) con `code` estable y `requestId`.
  - `Idempotency-Key` en POST de escritura (obligatoria para integraciones en `POST /renewal-requests`).
  - Bloqueo optimista con `version` en el cuerpo de PATCH/acciones sobre `subscriptions` y `renewal-tasks` → `409 version_conflict`.
- Versionado: cambios incompatibles ⇒ `/api/v2` en paralelo; `v1` se mantiene ≥ 6 meses tras anunciar su retirada (cabeceras `Deprecation` y `Sunset`). Añadir campos opcionales no es cambio incompatible.

## Alternativas consideradas

| Alternativa | Motivo de descarte |
|---|---|
| GraphQL | Autorización por campo y aislamiento por cliente más complejos (choca con RLS por fila), problemas N+1, caché HTTP y rate limiting por coste de consulta. No hay necesidad de agregación flexible con este volumen. |
| tRPC | Acopla cliente y servidor TypeScript; no sirve para integraciones externas de otros lenguajes. |
| PostgREST/Supabase Data API expuesto | Expone el esquema de BD como contrato, impide reglas de negocio en servidor (RN-15) y ata a Supabase. |

## Consecuencias

- (+) Contrato simple, cacheable, fácil de documentar y de probar con supertest.
- (+) Autorización por endpoint + scope, alineada con el manifest de integraciones.
- (−) Algunas pantallas requieren varias llamadas (se resuelve con endpoints de lectura agregada concretos: `GET /dashboard/summary`, `GET /clients/{id}` con resumen).
