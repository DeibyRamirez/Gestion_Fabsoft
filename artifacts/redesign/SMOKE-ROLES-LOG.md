# Log smoke por rol (sesión real, VM local)

Fecha: 2026-11-08  
Herramienta: Playwright `e2e/smoke/role-visual-evidence.spec.ts` + `auth.spec.ts`  
BD: PostgreSQL 16 sistema (`fabsoft_test`), seed `pnpm db:seed`

## admin@fabsoft.test

- Login → `/dashboard`; heading «Panel»; `ApiStatus` con API alcanzable.
- `/admin/users`: tabla con usuarios seed; formulario «Nuevo usuario».
- `/change-password`: formulario dentro de `AppShell`.
- Móvil: menú hamburguesa abre navegación «Principal».

## operador@fabsoft.test

- Login → `/dashboard`; footer «Rol: Operador».
- `/admin/users` → redirección a `/dashboard` (RoleGate, sin relajar permisos).
- Sidebar sin sección «Admin».

## portal@andina.test (client)

- Login → `/portal`; texto placeholder honesto (sin datos demo).

## portal@cafetal.test (client, mustChangePassword)

- Login → `/change-password` layout auth centrado (obligatorio).

## No ejecutado

- Usuario `inactivo@fabsoft.test` (disabled): pendiente de spec E2E dedicado.
- Captura con API caída: pendiente.
