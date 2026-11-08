# Matriz ruta × rol × diseño × verificación

**Implementado** = existe `page.tsx`. **Verificado** = Playwright con sesión real (seed `docs/seed-data.md`) y/o asserts en este corte.

| Ruta / escenario                        | admin | operator | client  | Diseño | Verificado                  | Spec E2E                                |
| --------------------------------------- | ----- | -------- | ------- | ------ | --------------------------- | --------------------------------------- |
| `/login`                                | ✓     | ✓        | ✓       | Sí     | Sí                          | `auth`, `redesign-edge-states`, handoff |
| Login usuario `inactivo@` (disabled)    | —     | —        | —       | Sí     | Sí (401, mensaje genérico)  | `redesign-edge-states`                  |
| Foco / skip link login                  | ✓     | ✓        | ✓       | Sí     | Sí (Tab + outline ≠ 0)      | `redesign-edge-states`                  |
| `/change-password` sin sesión           | —     | —        | —       | Sí     | Sí (redirige/carga)         | handoff                                 |
| `/change-password` voluntario           | ✓     | ✓        | ✓       | Sí     | Sí (admin capturado)        | `role-visual-evidence`, handoff         |
| `/change-password` obligatorio          | —     | —        | ✓       | Sí     | Sí (`portal@cafetal.test`)  | `role-visual-evidence`, handoff         |
| `/dashboard` + API OK                   | ✓     | ✓        | —       | Sí     | Sí                          | `auth`, `role-visual`, handoff          |
| `/dashboard` API loading                | ✓     | —        | —       | Sí     | Sí («Comprobando…»)         | `redesign-edge-states`, handoff         |
| `/dashboard` API unreachable            | ✓     | —        | —       | Sí     | Sí («No disponible»)        | `redesign-edge-states`, handoff         |
| `/admin/users`                          | ✓     | —        | —       | Sí     | Sí (tabla seed)             | `role-visual`, handoff                  |
| `/admin/users` forbidden                | —     | ✓        | —       | Sí     | Sí → `/dashboard`           | `auth`, `role-visual`, handoff          |
| `/portal` placeholder                   | —     | —        | ✓       | Sí     | Sí                          | `role-visual`, handoff                  |
| Nav «próximamente»                      | ✓     | ✓        | parcial | Sí     | Sí (operator sin Admin)     | `role-visual`                           |
| Rutas sin página (clientes, productos…) | —     | —        | —       | N/A    | No (solo nav deshabilitado) | —                                       |

## Capturas PNG (agente) — ruta completa por archivo

| Archivo                                                                          | Rol / contexto | Qué muestra                                      |
| -------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ |
| `/opt/cursor/artifacts/redesign/01-login-desktop.png`                            | público        | Login escritorio                                 |
| `/opt/cursor/artifacts/redesign/05-login-mobile.png`                             | público        | Login móvil                                      |
| `/opt/cursor/artifacts/redesign/02-change-password-unauth-desktop.png`           | sin sesión     | `/change-password` sin auth                      |
| `/opt/cursor/artifacts/redesign/06-login-skip-link-focus-desktop.png`            | a11y           | Skip link con foco teclado                       |
| `/opt/cursor/artifacts/redesign/07-login-email-focus-desktop.png`                | a11y           | Campo email con `:focus-visible`                 |
| `/opt/cursor/artifacts/redesign/08-login-inactive-user-error-desktop.png`        | login fallido  | `inactivo@fabsoft.test` → credenciales inválidas |
| `/opt/cursor/artifacts/redesign/10-dashboard-admin-desktop.png`                  | admin          | Panel escritorio                                 |
| `/opt/cursor/artifacts/redesign/11-users-admin-desktop.png`                      | admin          | Usuarios                                         |
| `/opt/cursor/artifacts/redesign/12-change-password-admin-desktop.png`            | admin          | Cambio contraseña en AppShell                    |
| `/opt/cursor/artifacts/redesign/13-dashboard-admin-mobile.png`                   | admin          | Panel móvil                                      |
| `/opt/cursor/artifacts/redesign/14-nav-admin-mobile.png`                         | admin          | Menú sheet móvil                                 |
| `/opt/cursor/artifacts/redesign/15-dashboard-api-unreachable-admin-desktop.png`  | admin          | Badge «No disponible»                            |
| `/opt/cursor/artifacts/redesign/16-dashboard-api-loading-admin-desktop.png`      | admin          | Badge «Comprobando…»                             |
| `/opt/cursor/artifacts/redesign/20-dashboard-operator-desktop.png`               | operator       | Panel escritorio                                 |
| `/opt/cursor/artifacts/redesign/21-operator-forbidden-users-desktop.png`         | operator       | Tras `/admin/users` → dashboard                  |
| `/opt/cursor/artifacts/redesign/22-dashboard-operator-mobile.png`                | operator       | Panel móvil                                      |
| `/opt/cursor/artifacts/redesign/30-portal-client-desktop.png`                    | client         | Portal escritorio                                |
| `/opt/cursor/artifacts/redesign/31-portal-client-mobile.png`                     | client         | Portal móvil                                     |
| `/opt/cursor/artifacts/redesign/32-change-password-mandatory-client-desktop.png` | client         | Cambio obligatorio                               |

## Accesibilidad (evidencia automatizada)

- Skip link «Saltar al contenido» recibe foco con primer Tab (`06-*`).
- Input email: `outlineWidth !== 0px` tras Tab (`07-*`).
- Contraste AA: tokens documentados en `docs/design.md` §1.1 (fg `#14213D` sobre `bg` `#F6F8FC`, primario `#4338CA`); sin auditoría Lighthouse en este corte.

## Comandos (última verificación local)

```text
pnpm format:check                                      → OK
pnpm lint / pnpm typecheck / pnpm test               → OK
pnpm exec playwright test smoke/auth.spec.ts \
  smoke/role-visual-evidence.spec.ts \
  smoke/redesign-edge-states.spec.ts                 → OK (con API reiniciada si hubo 429)
VISUAL_OUT_DIR=/opt/cursor/artifacts/redesign \
  pnpm exec playwright test smoke/redesign-handoff-capture.spec.ts → OK (local, skip en CI)
```

## Limitaciones

- Vacío real en tablas (sin registros) no probado en usuarios (seed siempre trae datos).
- QA FabSoft formal pendiente.
- `redesign-handoff-capture.spec.ts` omitido en CI (`test.skip(!!process.env.CI)`) para evitar rate-limit; CI usa specs atómicos.
