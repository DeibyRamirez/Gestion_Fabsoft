# Log smoke por rol (sesión real)

**Fecha:** 2026-11-08  
**Stack:** PostgreSQL 16 local (`fabsoft_test`), `pnpm db:seed`, API `:4000`, Next `:3000`  
**Specs:** `auth.spec.ts`, `role-visual-evidence.spec.ts`, `redesign-edge-states.spec.ts`, `redesign-handoff-capture.spec.ts` (solo local)

## admin@fabsoft.test

- Login → panel; `ApiStatus` con versión cuando health OK.
- Panel con health bloqueado (gate) → «Comprobando…».
- Health 503 simulado → «No disponible» (sin apagar auth).
- `/admin/users`: tabla seed visible.
- `/change-password` voluntario dentro de AppShell.
- Móvil: menú hamburguesa + navegación Gestión.

## operador@fabsoft.test

- Panel; footer «Rol: Operador»; sin bloque Admin.
- `/admin/users` → redirección UX a `/dashboard` (RoleGate); API seguiría en 403.
- Móvil: panel 390×844.

## portal@andina.test (client)

- Portal: placeholder sin datos demo.

## portal@cafetal.test (client, mustChangePassword)

- Login → `/change-password` layout auth centrado.

## inactivo@fabsoft.test (operator disabled)

- Login permanece en `/login`; alerta «Credenciales inválidas.» (igual que credencial mala; RN-15).

## Público / a11y

- Tab: skip link enfocado; email con outline visible.
- `/change-password` sin cookie → redirige a login.

## No verificado en este corte

- Tabla usuarios vacía (sin seed reset).
- Portal con suscripciones conectadas a API (pantalla aún placeholder).
- Contraste con herramienta automatizada Lighthouse/axe.
