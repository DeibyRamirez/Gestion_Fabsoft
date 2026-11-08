# Matriz ruta × rol × diseño × pruebas

Leyenda diseño: **Sí** = shells/tokens/componentes del rediseño. **N/A** = sin pantalla.  
Leyenda pruebas: **UT** vitest frontend, **Build** next build, **Smoke** e2e/manual (requiere stack completo).

| Ruta | admin | operator | client | Diseño | Pruebas automáticas | Limitaciones smoke |
|------|-------|----------|--------|--------|---------------------|--------------------|
| `/login` | ✓ | ✓ | ✓ | Sí | UT login-form, Build | Captura sin API |
| `/change-password` | ✓ | ✓ | ✓ | Sí | UT form + page view, Build | Requiere sesión para shell interno/portal |
| `/dashboard` | ✓ | ✓ | — | Sí | UT app-shell nav, Build | Requiere API + login |
| `/admin/users` | ✓ | — | — | Sí | Build | Requiere API admin |
| `/portal` | — | — | ✓ | Sí | Build | Requiere API client |
| `/` | ✓ | ✓ | ✓ | Sí | Build | Redirección |
| Nav próximamente | ✓ | ✓ | parcial | Sí (estilo disabled) | UT app-shell | Sin rutas 404 extra |

## Capturas (agente)

| Archivo | Descripción |
|---------|-------------|
| `/opt/cursor/artifacts/redesign/01-login-desktop.png` | Login 1280×800 |
| `/opt/cursor/artifacts/redesign/05-login-mobile.png` | Login 390×844 |
| `/opt/cursor/artifacts/redesign/02-change-password-unauth-desktop.png` | Change password sin sesión (redirige/carga) |

## Comandos ejecutados (resultado real)

```text
pnpm --filter @fabsoft/shared build          → OK
pnpm --filter @fabsoft/frontend test         → 7 files, 21 tests OK
pnpm --filter @fabsoft/frontend lint         → OK
pnpm --filter @fabsoft/frontend typecheck    → OK
pnpm --filter @fabsoft/frontend build        → OK (8 rutas estáticas)
pnpm lint (monorepo)                         → OK
pnpm typecheck (monorepo)                    → OK
```

## Tokens visuales aplicados

- Fondo página `#F6F8FC` (`--color-bg`), superficies blancas, tinta `#14213D`, primario `#4338CA`
- Paleta de estados de suscripción de `docs/design.md` §1.2 conservada en badges
- Panel lateral login `#14213D` (solo layout auth)
