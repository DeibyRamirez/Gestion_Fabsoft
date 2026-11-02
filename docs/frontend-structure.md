# Estructura del frontend — FabSoft (`frontend/`, Next.js 16)

> Consumidor puro de `/api/v1` (ADR-008). Sin acceso a BD, sin `supabase-js`, sin secretos. Toda autorización real ocurre en el backend (RN-15); el frontend sólo adapta la UI al rol.

## 1. Principios

1. **App Router** con dos *route groups* y layouts separados: `(internal)` para admin/operador y `(portal)` para usuarios cliente.
2. **Componentes cliente para datos** (TanStack Query) — el access token vive en memoria del navegador, por lo que las llamadas autenticadas se hacen desde el cliente. Los Server Components se usan para layout estático, metadatos y páginas públicas (login).
3. **Organización por módulo funcional** (`src/features/<módulo>`), alineada con los módulos del backend.
4. **Tipos y validación compartidos** desde `@fabsoft/shared` (DTOs Zod). Nunca se duplican enums ni esquemas.
5. Variables públicas sólo con prefijo `NEXT_PUBLIC_` y nunca secretas: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_ENV`.

## 2. Árbol

```
frontend/
├── next.config.ts                 # headers de seguridad (CSP, HSTS), output: 'standalone'
├── postcss.config.mjs
├── components.json                # configuración shadcn/ui
├── src/
│   ├── app/
│   │   ├── layout.tsx             # <html lang="es-CO">, fuentes, QueryProvider, AuthProvider, Toaster
│   │   ├── globals.css            # Tailwind 4 + tokens (docs/design.md)
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── change-password/page.tsx       # obligatorio si mustChangePassword
│   │   ├── (internal)/
│   │   │   ├── layout.tsx                     # AppShell + RoleGate(['admin','operator'])
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── clients/page.tsx
│   │   │   ├── clients/new/page.tsx
│   │   │   ├── clients/[clientId]/page.tsx    # pestañas vía ?tab=
│   │   │   ├── subscriptions/page.tsx
│   │   │   ├── subscriptions/new/page.tsx     # ?clientId= preseleccionado (Flujo A)
│   │   │   ├── subscriptions/[subscriptionId]/page.tsx
│   │   │   ├── renewal-requests/page.tsx
│   │   │   ├── renewal-requests/[requestId]/page.tsx
│   │   │   ├── tasks/page.tsx                 # API: /renewal-tasks
│   │   │   ├── tasks/[taskId]/page.tsx
│   │   │   ├── notifications/page.tsx
│   │   │   └── admin/                         # RoleGate(['admin'])
│   │   │       ├── layout.tsx
│   │   │       ├── users/page.tsx
│   │   │       ├── products/page.tsx
│   │   │       ├── integrations/page.tsx
│   │   │       ├── integrations/[integrationId]/page.tsx
│   │   │       ├── alert-rules/page.tsx
│   │   │       ├── audit/page.tsx
│   │   │       └── settings/page.tsx
│   │   ├── (portal)/
│   │   │   └── portal/
│   │   │       ├── layout.tsx                 # PortalShell + RoleGate(['client'])
│   │   │       ├── page.tsx                   # resumen de suscripciones
│   │   │       ├── subscriptions/[subscriptionId]/page.tsx
│   │   │       ├── requests/page.tsx
│   │   │       └── contact/page.tsx
│   │   ├── not-found.tsx
│   │   └── error.tsx
│   ├── features/
│   │   ├── auth/            # api.ts, use-session.ts, login-form.tsx, auth-provider.tsx, role-gate.tsx
│   │   ├── dashboard/       # api.ts (getDashboardSummary/Activity), kpi-grid.tsx, activity-feed.tsx
│   │   ├── clients/         # api.ts, hooks.ts, client-table.tsx, client-form.tsx, contacts-panel.tsx, notes-panel.tsx
│   │   ├── products/
│   │   ├── subscriptions/   # api.ts, hooks.ts, subscription-table.tsx, subscription-form.tsx,
│   │   │                    # renew-dialog.tsx, correct-expiration-dialog.tsx, cancel-dialog.tsx,
│   │   │                    # period-timeline.tsx, status-actions.ts (acciones visibles según estado+rol)
│   │   ├── renewal-requests/
│   │   ├── tasks/
│   │   ├── notifications/   # bell.tsx (polling 60 s), notification-list.tsx
│   │   ├── portal/          # api.ts (/portal/*), subscription-card.tsx, request-form.tsx
│   │   ├── integrations/    # manifest-editor.tsx (valida con el Zod del manifest), secret-reveal.tsx
│   │   ├── users/  alert-rules/  audit/  settings/
│   └── shared/
│       ├── api/
│       │   ├── client.ts        # fetch wrapper: base URL, Bearer, X-Request-Id, refresh, problem+json → ApiError
│       │   ├── query-keys.ts    # claves TanStack Query por recurso + filtros
│       │   └── idempotency.ts   # genera Idempotency-Key por intento de envío de formulario
│       ├── ui/                  # componentes shadcn/ui generados y adaptados a tokens
│       ├── components/          # DataTable, FilterBar, StatusBadge, KpiCard, ConfirmDialog, EmptyState
│       ├── lib/                 # format-money.ts (COP), format-date.ts (America/Bogota), url-filters.ts
│       └── hooks/               # use-url-filters.ts, use-debounce.ts
└── tests/                       # vitest + testing-library (componentes y hooks)
```

## 3. Autenticación en el cliente

1. `POST /auth/login` → guarda `accessToken` en memoria (contexto React) y el backend fija la cookie `fs_rt`.
2. Al cargar la app: `POST /auth/refresh` (con `credentials: 'include'` y cabecera `X-Requested-With: fabsoft-web`) para recuperar sesión; si falla → `/login`.
3. `shared/api/client.ts` reintenta **una vez** tras `401 token_expired` llamando a refresh (con *single-flight* para evitar refrescos simultáneos).
4. `RoleGate` redirige según `user.role`: `client` → `/portal`; `admin`/`operator` → `/dashboard`. Es sólo UX: el backend responde 403 igualmente.
5. `mustChangePassword=true` fuerza `/change-password`.
6. No se usa `proxy.ts` (antes `middleware.ts`) para autorización: el token no está disponible en el servidor de Next y la autorización es del backend.

## 4. Datos

- **TanStack Query**: `staleTime` 30 s para listas, 5 min para catálogo y reglas; invalidación por recurso tras mutaciones (`renew` invalida `subscriptions`, `subscription-periods`, `renewal-tasks`, `notifications`, `dashboard`).
- Filtros y paginación **en la URL** (compartibles; los KPIs del dashboard construyen la URL a partir de `indicator.resource` + `indicator.filter`).
- Mutaciones con `version` (bloqueo optimista): ante `409 version_conflict` se muestra aviso y se recarga el recurso.
- Formularios: `react-hook-form` + `zodResolver(schemaDeShared)`; cada envío genera una `Idempotency-Key` nueva y la reutiliza en reintentos del mismo envío.
- Errores `problem+json` → mensajes en español por `code` (`shared/api/error-messages.ts`).

## 5. Seguridad del frontend

- CSP estricta en `next.config.ts` (`default-src 'self'; connect-src 'self' <API>; frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`.
- Prohibido `dangerouslySetInnerHTML` y almacenar tokens en `localStorage`/`sessionStorage` (regla ESLint).
- No se registran en consola datos de respuesta en producción.

## 6. Testing del frontend

Ver `docs/testing-strategy.md` §7: componentes críticos (`StatusBadge`, `DataTable` con filtros en URL, `RenewDialog`, `RoleGate`, `client.ts` con refresh) con vitest + Testing Library, usando respuestas simuladas tipadas con los esquemas de `@fabsoft/shared`.
