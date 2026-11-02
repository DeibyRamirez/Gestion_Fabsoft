# Contexto del proyecto — FabSoft (resumen para agentes)

> Leer primero. Este documento resume visión, alcance y decisiones; el detalle está enlazado. Si una fuente (`fuentes/`) contradice un documento de `docs/`, **prevalece `docs/`** (decisiones del dueño registradas en ADR). Ante algo no cubierto: no inventar requisitos; anotarlo como pregunta abierta.

## 1. Visión

FabSoft es una plataforma interna para **centralizar clientes, productos, licencias/suscripciones y renovaciones**, reemplazando hojas de cálculo y recordatorios dispersos. Objetivo: que ninguna renovación se pierda por falta de seguimiento, con alertas automáticas, historial de periodos, un **portal de consulta para clientes** y una **API REST** para integraciones.

Usuarios: 2–5 internos (`admin`, `operator`), usuarios de clientes (`client`, sólo portal) e integraciones externas (API key con scopes).

## 2. Alcance del MVP

| Módulo | Incluye | Documentos |
|---|---|---|
| Autenticación y usuarios | Login email+contraseña (JWT 15 min + refresh rotativo en cookie), contraseña temporal con cambio obligatorio, roles admin/operator/client | ADR-001, `security/` |
| Clientes | Alta, edición, archivado/reactivación, contactos, notas, NIT único normalizado, actividad | `data-model.md`, `api/openapi.yaml` |
| Productos | Catálogo (`third_party`, `own`, `recurring_service`), activo/inactivo | ídem |
| Suscripciones | Alta, activación, renovación con nuevo periodo (historial inmutable), no renovada, cancelación, corrección de vencimiento, estado de pago manual por periodo | `business-rules.md` RN-01…RN-07 |
| Alertas y tareas | Reglas D30/D15/D7/D1/D0/POST1, notificaciones in-app y email (Resend vía worker), tareas de renovación | `notifications.md`, ADR-005 |
| Solicitudes de renovación | Desde portal, interno o integración; revisión y resolución | RN-05 |
| Dashboard | KPIs (vencen en 30/15/7 días, vencidas, solicitudes pendientes, pagos pendientes, tareas) y actividad | `design.md` |
| Portal cliente | Sus suscripciones visibles, solicitar renovación, ver sus solicitudes, canal de contacto | RN-11 |
| Integraciones | Manifest JSON, API keys hasheadas, scopes y alcance de clientes, rate limit, idempotencia | `integrations/` |
| Auditoría | Registro append-only de cambios sensibles | RN-13 |

## 3. Fuera de alcance (MVP)

Pagos en línea/Wompi (ADR-003) · GraphQL (ADR-002) · microservicios, Kubernetes · app móvil nativa · websockets/tiempo real (polling 60 s) · Supabase Auth, Supabase Storage, Realtime y Data API (ADR-008) · multimoneda (sólo COP) · borrado físico de históricos · subida de archivos de contratos (sólo `contract_reference`) · webhooks (post-MVP, sólo con consumidor real) · calendario externo/MCP como fuente de fechas (la BD es la fuente de verdad) · facturación electrónica, contabilidad, reportes financieros avanzados, renovación automática con proveedores, integraciones específicas con Microsoft/Google, automatizaciones de marketing.

## 4. Decisiones clave

| # | Decisión | Dónde |
|---|---|---|
| 1 | Monolito modular TypeScript: `domain` / `application` / `infrastructure` / `interfaces`, SOLID estricto, DIP con composition root | `architecture.md` |
| 2 | Backend **Express 5** propio (API + worker); frontend **Next.js 16** separado; monorepo pnpm | ADR-008, `stack.md` |
| 3 | **Supabase sólo como PostgreSQL gestionado + RLS**; migrable a PostgreSQL 16 en VPS cambiando adaptadores (`DB_PROVIDER`) | ADR-008, `architecture.md` §6–7 |
| 4 | REST `/api/v1`, contrato OpenAPI 3.1, problem+json, paginación `page/pageSize` | ADR-002, `api/openapi.yaml` |
| 5 | JWT (EdDSA) para humanos; API keys `fsk_…` hasheadas (HMAC+pepper) para integraciones | ADR-001 |
| 6 | RLS en todas las tablas (`FORCE`), contexto `app.*` fijado por transacción, rol `fabsoft_app` sin BYPASSRLS; denegar por defecto | ADR-004, `backend/migrations/0002_rls.sql` |
| 7 | Envío de email sólo desde worker pg-boss con tabla `notifications` (idempotente, reintentos) | ADR-005, `notifications.md` |
| 8 | Singletons sólo para infraestructura sin estado de usuario | ADR-006 |
| 9 | Repositorios por caso de uso (puertos pequeños), no CRUD genérico | ADR-007 |
| 10 | Vigencia, pago y seguimiento son **tres dimensiones separadas**; fechas de negocio `date` con fin inclusivo en `America/Bogota`; moneda COP | `data-model.md`, RN-03/RN-07 |

## 5. Mapa de documentos

- `README.md` — cómo levantar el monorepo.
- `docs/stack.md`, `docs/architecture.md`, `docs/adr/` — tecnología y arquitectura.
- `docs/data-model.md`, `backend/migrations/` — modelo de datos y SQL.
- `docs/business-rules.md` — RN-01…RN-16 con equivalencias y tests.
- `docs/security/threat-model.md`, `docs/security/permissions-matrix.md` — seguridad y permisos.
- `docs/api/openapi.yaml`, `docs/integrations/` — API e integraciones.
- `docs/notifications.md` — alertas y correo.
- `docs/design.md`, `docs/frontend-structure.md` — UI.
- `docs/testing-strategy.md`, `docs/observability.md`, `docs/deployment.md`, `docs/seed-data.md` — calidad y operación.
- `fuentes/funcional.md`, `fuentes/contexto-tecnico.md` — documentos originales (referencia; ver nota inicial).

## 6. Supuestos adoptados (preguntas abiertas de las fuentes)

1. Destinatarios de alertas: responsable de la suscripción → responsable del cliente → todos los admins.
2. Email habilitado por regla (`alert_rules.channels`) y globalmente por `EMAIL_TRANSPORT=resend`; D0 sólo in-app.
3. Pagos: sólo estado manual por periodo (`not_tracked` / `pending` / `received`), sin conciliación.
4. Contratos: sólo referencia textual; sin almacenamiento de archivos.
5. Moneda única COP (CHECK en BD).
6. Un cliente puede tener varios usuarios de portal.
7. El operador puede crear clientes y suscripciones y corregir vencimientos (con motivo); archivar clientes, cancelar suscripciones, cambiar precio/costo, gestionar usuarios, productos, integraciones, reglas, configuración y reintentar alertas fallidas es sólo de admin (`docs/security/permissions-matrix.md`).
8. "No renovada" se decide en el periodo (`renewal_outcome`); el job de vencimiento aplica `not_renewed` al llegar la fecha.

## 7. Glosario

| Término | Significado |
|---|---|
| Cliente (`clients`) | Organización a la que FabSoft vende/gestiona productos. Se archiva, nunca se borra. |
| Producto (`products`) | Elemento del catálogo: licencia de tercero, software propio o servicio recurrente. Sin precio ni fechas. |
| Suscripción (`subscriptions`) | Instancia concreta de un producto para un cliente, con precio, ciclo y vencimiento. |
| Periodo (`subscription_periods`) | Tramo de vigencia con fechas, precio y resultado de renovación; inmutable salvo campos de cierre. |
| Vencimiento | `current_period_end`: último día **incluido** de vigencia (hora Bogotá). |
| Vigencia (`status`) | `pending_activation`, `active`, `in_renewal`, `expired`, `cancelled`, `not_renewed`. |
| Estado de pago (`payment_status`) | Por periodo: `not_tracked`, `pending`, `received`. Independiente de la vigencia. |
| Seguimiento (`follow_up_status`) | Gestión comercial: `none`, `in_progress`, `awaiting_client`, `closed`. |
| Solicitud de renovación (`renewal_requests`) | Petición de un cliente/integración/interno; **no** renueva por sí misma. Estados `pending_review`, `in_progress`, `resolved`. |
| Tarea de renovación (`tasks`, API `/renewal-tasks`) | Acción interna asignable (contactar, enviar propuesta, verificar pago, revisar vencida…). |
| Regla de alerta (`alert_rules`) | D30, D15, D7, D1, D0, POST1: días respecto al vencimiento, canales y tarea a crear. |
| Notificación (`notifications`) | Alerta concreta programada (in-app o email) con `dedupe_key` única. |
| Integración (`integrations`) | Sistema externo descrito por un manifest, con scopes y alcance `all`/`own`. |
| API key (`api_credentials`) | Credencial `fsk_<live|test>_<prefijo>_<secreto>`; sólo se guarda su hash. |
| Contexto RLS | Variables `app.*` (actor, rol, usuario, cliente, integración) fijadas por transacción que usan las políticas. |
| Actor `system` | Contexto reservado a autenticación y worker; nunca disponible para peticiones HTTP. |
| Portal | Área `/portal` y API `/api/v1/portal/*` para usuarios `client`. |
| NIT | Identificación tributaria colombiana (`tax_id`), única tras normalizar. |
