# Matriz ruta × rol × diseño × pruebas

**Implementado** = pantalla existe en el repo. **Verificado** = smoke local con sesión real (Playwright) o prueba automatizada equivalente.

Leyenda diseño: **Sí** = tokens/shells del rediseño.  
Pruebas: **UT** vitest, **E2E** Playwright (`e2e/smoke`), **Build** next build.

## Cobertura por ruta

| Ruta                     | admin | operator     | client  | Diseño | Verificado (rol)                                            | Pruebas automáticas              |
| ------------------------ | ----- | ------------ | ------- | ------ | ----------------------------------------------------------- | -------------------------------- |
| `/login`                 | ✓     | ✓            | ✓       | Sí     | admin/operator/client (flujo login)                         | UT login-form; E2E auth + visual |
| `/change-password`       | ✓     | ✓            | ✓       | Sí     | admin voluntario; client obligatorio (`mustChangePassword`) | UT form + page view; E2E visual  |
| `/dashboard`             | ✓     | ✓            | —       | Sí     | admin + operator (panel + API health)                       | E2E auth + visual; Build         |
| `/admin/users`           | ✓     | —            | —       | Sí     | admin (tabla usuarios seed)                                 | E2E visual admin                 |
| `/admin/users` forbidden | —     | ✓ (redirige) | —       | Sí     | operator → `/dashboard`                                     | E2E auth + visual                |
| `/portal`                | —     | —            | ✓       | Sí     | client (placeholder honesto)                                | E2E visual                       |
| `/`                      | ✓     | ✓            | ✓       | Sí     | indirecto vía login                                         | Build                            |
| Nav «próximamente»       | ✓     | ✓            | parcial | Sí     | operator sin bloque Admin                                   | UT app-shell nav; E2E operator   |

## Rutas no implementadas (solo nav deshabilitado)

Sin `page.tsx`: clientes, suscripciones, solicitudes, tareas, alertas, productos, integraciones, auditoría, etc. **Diseño N/A en pantalla**; enlace «Próximamente» verificado en sidebar.

## Stack local usado para verificación (VM agente)

Docker no disponible (`docker: command not found`). Alternativa segura aplicada:

1. `sudo apt-get install postgresql` + servicio local PG 16
2. BD aislada `fabsoft_test`, rol `fabsoft_owner` (solo VM)
3. `pnpm db:migrate:test` → `pnpm db:roles:dev` → `pnpm db:seed` (`docs/seed-data.md`)
4. API `localhost:4000`, Next `localhost:3000` con `NEXT_PUBLIC_API_BASE_URL`
5. Credenciales seed (no producción): `admin@fabsoft.test` / `Admin.dev-2026!`, etc.

## Comandos (resultado real, 2026-11-08)

```text
pnpm db:migrate:test && pnpm db:roles:dev && pnpm db:seed     → OK
pnpm exec playwright test smoke/auth.spec.ts smoke/role-visual-evidence.spec.ts → 8 passed
pnpm --filter @fabsoft/frontend test                          → 21 passed
pnpm test (monorepo unit)                                     → OK
pnpm lint / pnpm typecheck                                    → OK
```

## Capturas autenticadas (`/opt/cursor/artifacts/redesign/`)

| Archivo                                           | Rol      | Vista                        |
| ------------------------------------------------- | -------- | ---------------------------- |
| `10-dashboard-admin-desktop.png`                  | admin    | Panel                        |
| `11-users-admin-desktop.png`                      | admin    | Usuarios                     |
| `12-change-password-admin-desktop.png`            | admin    | Cambio voluntario            |
| `13-dashboard-admin-mobile.png`                   | admin    | Panel móvil                  |
| `14-nav-admin-mobile.png`                         | admin    | Menú sheet                   |
| `20-dashboard-operator-desktop.png`               | operator | Panel                        |
| `21-operator-forbidden-users-desktop.png`         | operator | Tras intentar `/admin/users` |
| `30-portal-client-desktop.png`                    | client   | Portal                       |
| `31-portal-client-mobile.png`                     | client   | Portal móvil                 |
| `32-change-password-mandatory-client-desktop.png` | client   | Cambio obligatorio           |

Públicas previas: `01-login-desktop.png`, `05-login-mobile.png`, `02-change-password-unauth-desktop.png`.

## Limitaciones explícitas

- **No** se afirma cobertura de pantallas futuras (clientes, productos, licencias, etc.).
- **QA FabSoft** sigue pendiente (revisión humana formal).
- Estado **error API** en panel: no capturado con API caída (health OK en smoke).
- **Teclado/foco/contraste AA**: cubiertos por UT + `docs/design.md`; sin auditoría automatizada Lighthouse en este corte.
