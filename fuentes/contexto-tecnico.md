# FabSoft — Contexto técnico consolidado para agentes de desarrollo

> **Propósito de este documento:** alimentar el contexto de un grupo de agentes que construirán el sistema FabSoft. Recoge las decisiones técnicas, correcciones y advertencias discutidas, para que la implementación no repita errores ni contradiga el alcance funcional del MVP original (`fabsoft_gestion_licencias_mvp.md`).

---

## 1. Resumen ejecutivo

FabSoft es una plataforma interna de gestión de clientes, licencias/suscripciones y renovaciones. El MVP prioriza **visibilidad, seguimiento, trazabilidad y seguridad**. No incluye pagos en línea, facturación ni contabilidad.

**Stack decidido para la implementación:**

- **Backend:** Next.js 16 + Supabase, obtener un backend construido, pero tambien contruir nuestro backend, cuando nesecitemos migrar a un db fuera de supabase con Next.js 16
- **Base de datos:** PostgreSQL (relacional, con RLS)
- **Frontend:** separado del backend, en su propio directorio
- **Gestor de paquetes:** pnpm (workspace/monorepo)
- **Autenticación:** JWT (humanos) + API keys hasheadas (integraciones)
- **Correos:** Resend, **detrás de un worker** con tabla de notificaciones
- **API:** REST versionada (`/api/v1/...`), **no GraphQL**
- **Arquitectura:** monolito modular por capas, con `repository` y `singleton` acotados
- **Moneda:** COP
- **Pasarela de pagos (Wompi):** **fuera del MVP** (ver §9)

> ⚠️ **Nota de coherencia:** el documento funcional original menciona Next.js 16 + Supabase. Esta propuesta adopta Express + PostgreSQL puro. Es una decisión válida, pero **implica implementar manualmente** auth, storage y RLS. Los agentes deben construir sobre este stack y no mezclar ambos caminos sin justificación explícita.

---

## 2. Lo que SÍ debe ir en el sistema

### 2.1 Módulos funcionales (MVP)

1. **Autenticación y roles** (admin FabSoft, operador FabSoft, usuario cliente, integración externa).
2. **Gestión de clientes** con contactos, responsable interno y notas.
3. **Catálogo de productos** (tercero, propio, servicio recurrente).
4. **Gestión de suscripciones/licencias** con fechas, periodicidad, precio, moneda, condiciones, estado y responsable.
5. **Historial de periodos y renovaciones** (sin sobrescribir periodos anteriores).
6. **Renovaciones y tareas** con filtros por responsable, fecha, prioridad, estado, cliente y suscripción.
7. **Alertas de vencimiento** idempotentes (30/15/7/1 días y post-vencimiento), con estado de envío, reintentos y error registrado.
8. **Dashboard operativo** con indicadores derivados de datos reales (no manuales), cada uno enlazando a la lista filtrada.
9. **Portal de clientes** con acceso limitado a su organización y solicitud de renovación.
10. **API REST v1** para integraciones externas, con permisos por integración, paginación, filtros, idempotencia y auditoría.
11. **Auditoría** de cambios sensibles (actor, acción, recurso, fecha, resumen; sin secretos).

### 2.2 Modelo de datos conceptual (mínimo)

`clients`, `client_contacts`, `products`, `subscriptions`, `subscription_periods`, `renewal_requests`, `tasks`, `notifications`, `users` (perfiles/roles), `integrations`, `api_credentials`, `audit_logs`.

> Los agentes pueden ajustar nombres y relaciones, pero **deben respetar las reglas de negocio** del documento funcional (§8 de `fabsoft_gestion_licencias_mvp.md`).

### 2.3 Reglas de negocio invariantes

- Una suscripción pertenece a un cliente y referencia un producto.
- Un producto puede tener muchas suscripciones.
- **Los periodos anteriores NO se sobrescriben** al renovar.
- **Solicitud de renovación ≠ renovación confirmada ≠ pago recibido.**
- **Vigencia, pago y estado comercial son dimensiones separadas.**
- Alertas idempotentes: misma regla + misma suscripción + mismo periodo = una sola alerta.
- Al cambiar fechas, periodicidad o estado → recalcular/cancelar alertas y tareas relacionadas.
- Suscripciones canceladas o no renovables no generan alertas (salvo excepción configurada).
- Cliente solo ve su organización y campos autorizados.
- Integraciones solo operan dentro de sus permisos.
- Cambios sensibles auditados.
- **No eliminar físicamente** registros con historial contractual o de auditoría.
- **Toda la lógica de negocio se ejecuta en el servidor.** La UI no autoriza.

### 2.4 Separación de dimensiones (crítico)

Modelar por separado cuando se necesiten:

- `estado_vigencia`: pendiente / activa / en renovación / vencida / cancelada / no renovada.
- `estado_pago`: (independiente; nunca inferido de la fecha).
- `estado_seguimiento`: (tarea/renovación en curso).

### 2.5 Seguridad y autorización

- **RLS en PostgreSQL por tabla**, pero **RLS no reemplaza la autorización en la capa de aplicación**.
- **Contexto de sesión por transacción:** cada request debe ejecutar `SET LOCAL app.current_user_id = ...` (o equivalente) dentro de una transacción, antes de las queries. Documentar el contrato `withRlsContext(userId, fn)`.
- **JWT para humanos:** access token corto (~15 min) + refresh token rotativo almacenado en DB. Soportar revocación.
- **API keys para integraciones:** hash en DB (`api_credentials`), **nunca texto plano**. Revocación y último uso registrados.
- **No mezclar** credenciales de usuario humano con integraciones.
- **Nunca exponer** `service_role`, secretos ni claves en el navegador.
- Operaciones privilegiadas solo en servidor con autorización explícita.
- Procesos de alertas y jobs diseñados para **soportar reintentos** (no asumir ejecución única).

### 2.6 API REST

- Versionada: `/api/v1/...`
- Endpoints iniciales: `GET /clients`, `GET /clients/{id}`, `GET /products`, `GET /subscriptions`, `GET /subscriptions/{id}`, `GET /subscriptions/expiring`, `GET /renewal-tasks`, `POST /renewal-requests`.
- Requisitos: autenticación por integración, permisos por scope, respuestas/errores consistentes, paginación y filtros, versionado, auditoría de operaciones, revocación de credenciales, límites de consumo, documentación (OpenAPI 3.1), protección contra acceso cruzado, **idempotencia en escrituras**.
- **Manifest JSON por integración** (versionado, validado en servidor, auditado). Ejemplo:

json

```
{
  "integration": "erp-contable",
  "version": "1.0.0",
  "scopes": ["subscriptions:read", "renewal-requests:write"],
  "client_scope": "own"
}
```

### 2.7 Correos (Resend)

- Resend **detrás de un worker** (cron o cola ligera tipo `pg-boss` sobre Postgres). **No** llamar a Resend desde el request HTTP del usuario.
- Tabla `notifications` con: tipo, fecha programada, canal, estado (pendiente/enviada/fallida/cancelada), intentos, último error, fecha de envío.
- **Idempotencia:** clave propia (suscripción + tipo + fecha) + `Idempotency-Key` de Resend.
- Respetar límites de tasa de Resend.

### 2.8 Patrones y arquitectura

- **Monolito modular por capas:** `domain` → `application` → `infrastructure` → `interfaces`.
- **Repository pattern:** por **caso de uso** (ej. `findExpiring(days)`, `renew(id, period)`), **no CRUD genérico por tabla**. Centraliza el `withRlsContext`.
- **Singleton:** **solo** para infraestructura sin estado de usuario (pool DB, cliente Resend, logger). **No** para lógica de negocio ni para contexto de usuario (rompe RLS y testabilidad).
- **DTOs explícitos + Zod** (o similar) para validar entrada/salida. No inventar patrones con nombre propio.
- **Adapters/infrastructure** para integraciones externas (capa anti-corrupción). Nombrar capas con términos estándar.
- **Monorepo pnpm** con `packages/shared` (DTOs, Zod schemas, tipos, constantes) y `packages/config` (tsconfig, eslint, prettier).

### 2.9 Estructura de directorios sugerida

text

```
fabsoft/
├── pnpm-workspace.yaml
├── packages/
│   ├── shared/              # DTOs, Zod schemas, tipos, constantes
│   └── config/              # tsconfig, eslint, prettier
├── backend/
│   ├── src/
│   │   ├── domain/          # entidades, reglas puras
│   │   ├── application/     # casos de uso
│   │   ├── infrastructure/  # repos, Resend, Postgres, RLS context
│   │   ├── interfaces/      # Express routes, controllers, middlewares
│   │   └── jobs/            # worker de alertas (pg-boss)
│   ├── migrations/          # SQL + políticas RLS
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── features/        # por módulo
│   │   └── shared/
└── docs/
    ├── api/                 # OpenAPI 3.1
    └── integrations/        # manifests JSON por integración
```

### 2.10 Orden de implementación

1. **Base funcional:** auth, roles, clientes, catálogo, suscripciones.
2. **Operación y renovaciones:** historial de periodos, tareas, motor de alertas, dashboard.
3. **Portal de clientes:** acceso, visualización, solicitudes.
4. **API e integraciones:** versionado, permisos por integración, documentación, pruebas de aislamiento.

> El diseño de **permisos y aislamiento de datos** no se deja para el final.

---

## 3. Lo que NO debe ir en el sistema (MVP)

| Excluido                                                            | Motivo                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Procesamiento de pagos en línea (Wompi)**                         | Contradice el alcance del MVP. El doc dice explícitamente "fuera del alcance inicial". Si se necesita, va en **Etapa 5** con modelo `payments` separado de `subscriptions`.                      |
| **Facturación electrónica**                                         | Fuera de alcance.                                                                                                                                                                                |
| **Contabilidad completa**                                           | Fuera de alcance.                                                                                                                                                                                |
| **Renovación automática con proveedores externos**                  | Fuera de alcance.                                                                                                                                                                                |
| **Integraciones específicas con Microsoft, Google, etc.**           | Fuera de alcance.                                                                                                                                                                                |
| **App móvil nativa**                                                | Fuera de alcance.                                                                                                                                                                                |
| **Automatizaciones complejas de marketing**                         | Fuera de alcance.                                                                                                                                                                                |
| **Reportes financieros avanzados**                                  | Fuera de alcance.                                                                                                                                                                                |
| **GraphQL**                                                         | No se justifica con 2–5 usuarios internos y un puñado de integraciones. Complica RLS y añade N+1, caching y autorización por campo. **Usar REST.**                                               |
| **MCP / calendario externo como fuente de verdad de fechas**        | Rompe idempotencia y trazabilidad. La fuente de verdad es la DB. Integración de calendario (Google/Outlook/CalDAV) es **opcional y post-MVP**, solo para leer feriados o escribir recordatorios. |
| **Webhooks**                                                        | Opcionales, post-MVP, solo si existe consumidor real.                                                                                                                                            |
| **Singleton para lógica de negocio**                                | Rompe testabilidad y RLS (el contexto de usuario debe ser por-request).                                                                                                                          |
| **Repository CRUD genérico por tabla**                              | Sobre-ingeniería. Repository por caso de uso.                                                                                                                                                    |
| **Términos ambiguos** ("OBJJSON", "Extraction")                     | Usar DTOs + Zod y adapters/infrastructure.                                                                                                                                                       |
| **Llamar a Resend desde el request HTTP del usuario**               | Debe ir detrás de worker con tabla `notifications`.                                                                                                                                              |
| **Inferir estado de pago desde fecha de vencimiento**               | Dimensiones separadas.                                                                                                                                                                           |
| **Sobrescribir periodos anteriores al renovar**                     | Historial obligatorio.                                                                                                                                                                           |
| **Eliminar físicamente clientes/suscripciones con historial**       | Desactivar/archivar.                                                                                                                                                                             |
| **Confiar solo en la UI para autorizar**                            | Toda autorización se valida en servidor.                                                                                                                                                         |
| **Exponer secretos (**`service_role`**, API keys) en el navegador** | Nunca.                                                                                                                                                                                           |

---

## 4. Decisiones técnicas consolidadas (tabla de veredictos)

| Propuesta                        | Veredicto       | Acción concreta                                                        |
| -------------------------------- | --------------- | ---------------------------------------------------------------------- |
| Node.js + Express                | ✅ Mantener      | —                                                                      |
| PostgreSQL                       | ✅ Mantener      | RLS nativo, transacciones, JSONB para auditoría                        |
| pnpm                             | ✅ Mantener      | Workspace/monorepo                                                     |
| Separar `backend/` y `frontend/` | ✅ Mantener      | —                                                                      |
| Monolito modular por capas       | ✅ Mantener      | `domain` → `application` → `infrastructure` → `interfaces`             |
| Repository                       | ✅ Mantener      | Por caso de uso, no CRUD genérico                                      |
| Singleton                        | ⚠️ Acotado      | Solo pool DB, cliente Resend, logger                                   |
| RLS en cada tabla                | ⚠️ Con matices  | Contexto por transacción + autorización en app                         |
| JWT                              | ⚠️ Con matices  | Access corto + refresh rotativo; API keys hasheadas para integraciones |
| REST vs GraphQL                  | ✅ REST          | GraphQL no se justifica                                                |
| Resend                           | ⚠️ Con matices  | Detrás de worker con tabla `notifications`                             |
| Wompi                            | ❌ Fuera del MVP | Etapa 5, si se necesita                                                |
| MCP calendario                   | ⚠️ Post-MVP     | No como fuente de verdad; integración opcional                         |
| "OBJJSON"                        | ❌ Reemplazar    | DTOs + Zod                                                             |
| "Extraction"                     | ❌ Reemplazar    | Adapters / infrastructure                                              |
| Manifest JSON de permisos        | ✅ Mantener      | Versionado, validado en servidor, auditado                             |

---

## 5. Advertencias críticas para los agentes

1. **RLS no es suficiente por sí sola.** Debe combinarse con autorización en la capa de aplicación. Documentar el contrato `withRlsContext`.
2. **JWT stateless no permite revocación.** Implementar refresh token rotativo en DB o lista negra por `jti`.
3. **No mezclar credenciales humanas con integraciones.** API keys hasheadas y separadas.
4. **Wompi contradice el alcance del MVP.** No implementarlo en la primera versión.
5. **Resend no es un motor de colas.** Worker + tabla `notifications` + idempotencia + reintentos.
6. **No depender de calendarios/MCP externos para calcular vencimientos.** La DB es la fuente de verdad.
7. **No inventar patrones con nombre propio.** DTOs, Zod, adapters, repository, singleton (acotado).
8. **No sobrescribir periodos.** Historial obligatorio.
9. **No inferir pago desde fecha.** Dimensiones separadas.
10. **No eliminar registros con historial.** Desactivar/archivar.
11. **Toda autorización en servidor.** La UI no autoriza.
12. **Jobs idempotentes y reintentables.** No asumir ejecución única.
13. **No exponer secretos en el navegador.**
14. **Confirmar stack Express+Postgres vs Next.js+Supabase.** Son caminos distintos; no mezclar sin justificación.
15. **Documentar la API (OpenAPI 3.1) y validar entradas/permisos.**

---

## 6. Preguntas funcionales pendientes (a resolver con el equipo antes de cerrar el diseño de DB)

1. ¿Se registran pagos y cartera en el MVP, o solo precios, costos y renovaciones?
2. ¿Qué monedas se usarán? (COP confirmado; ¿otras?)
3. ¿La mayoría de licencias tienen renovación manual o existen casos reales de renovación automática?
4. ¿Las alertas se muestran solo in-app o también se envían por correo?
5. ¿Un cliente puede tener varios usuarios en el portal?
6. ¿Las integraciones solo leen o también escriben?
7. ¿Se adjuntan contratos, facturas o comprobantes? (¿Storage?)
8. ¿Quién recibe las alertas y cómo se asigna el responsable de cada renovación?

> Estas preguntas **no bloquean** la construcción inicial de los módulos básicos, pero sí deben resolverse antes de la Etapa 4 (API e integraciones) y antes de cerrar el esquema de DB.

---

## 7. Criterios de aceptación del MVP (recordatorio)

El MVP es funcional cuando:

- Un administrador crea usuarios internos y gestiona clientes.
- Un usuario autorizado registra productos y suscripciones.
- Se identifican claramente suscripciones activas, próximas a vencer, vencidas o canceladas.
- Cada suscripción tiene fecha de vencimiento e historial de periodos.
- El sistema genera alertas según reglas configuradas **sin duplicarlas**.
- El equipo crea, asigna, filtra y cierra tareas de seguimiento.
- Una renovación conserva el periodo anterior y registra el nuevo.
- El portal de clientes muestra **solo** la información autorizada de ese cliente.
- Un cliente solicita renovación y el equipo la gestiona.
- Una integración autorizada consulta la API.
- La API impide accesos no autorizados y documenta sus operaciones.
- Los cambios sensibles quedan auditados.
- Los errores de envío de alertas **no pierden el registro** y pueden gestionarse.
- Listas de clientes, suscripciones y tareas tienen filtros y paginación.

---

## 8. Resultado esperado

La plataforma debe ser la **fuente central de información** de FabSoft para clientes, licencias y renovaciones. El equipo anticipa vencimientos y actúa a tiempo; los clientes consultan solo lo que les corresponde; y otras aplicaciones se integran mediante una API segura y documentada.

**Prioridad del MVP:** visibilidad, seguimiento, trazabilidad y seguridad. La automatización avanzada y las funciones financieras completas se añaden cuando el uso real confirme su necesidad.

---

## 9. Referencias

- Documento funcional original: `fabsoft_gestion_licencias_mvp.md`.
- Este documento: consolidado técnico para agentes.
- Documentos a generar por los agentes:
  - `docs/api/openapi.yaml` (OpenAPI 3.1).
  - `docs/integrations/*.json` (manifests por integración).
  - `backend/migrations/*.sql` (esquema + políticas RLS).
  - `docs/adr/` (Architecture Decision Records: JWT vs API keys, REST vs GraphQL, Wompi post-MVP, RLS context).
