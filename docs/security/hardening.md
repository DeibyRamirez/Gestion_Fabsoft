# Hardening HT-06

> Controles aplicados en el bloque 6 (Sprint 3). Complementa `threat-model.md`, `permissions-matrix.md` y `docs/testing-strategy.md`.

## 1. Cabeceras HTTP

### API (`/api/v1`)

Configuradas explícitamente con Helmet en `backend/src/interfaces/http/app.ts`:

| Cabecera | Valor |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Content-Security-Policy` | `default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | camera, microphone, geolocation, payment y usb deshabilitados |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `X-Powered-By` | eliminado |

`GET /api/v1/docs` es la única excepción de CSP: permite `script-src 'self'` y `style-src 'self' 'unsafe-inline'` para los assets locales de Swagger UI, sin CDNs.

### Frontend

`frontend/src/shared/security/headers.ts` define las cabeceras que Next.js aplica en `next.config.ts`:

- CSP con `default-src 'self'`, `connect-src` limitado al propio frontend y al origen de `NEXT_PUBLIC_API_BASE_URL`, `frame-ancestors 'none'` y sin comodines.
- HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, Permissions-Policy y cabeceras de aislamiento.
- En desarrollo se añaden `'unsafe-eval'` y el WebSocket local de HMR; producción no.

## 2. Dependencias

```bash
pnpm audit:dependencies   # falla ante high/critical no aceptados
```

Riesgos aceptados (revisar antes del 2027-02-28):

| Advisory | Paquete | Severidad | Motivo |
|---|---|---|---|
| `GHSA-mrhx-c7xc-m3w5` | `zod` | high | Sin parche en Zod 3. Mitigado por límite de cuerpo 100 KB, esquemas acotados y paginación ≤100. Revisar al migrar a Zod 4. |
| `GHSA-w5hq-g745-h8pq` | `uuid` (transitiva de `pg-boss`) | moderate | pg-boss usa `uuid` v4; el advisory afecta v3/v5/v6 con buffers controlados. |
| `GHSA-g3hv-75wg-m249` | `minimatch` (typescript-eslint) | moderate | Herramienta de lint; no se despliega en la API. |

Dependabot (`.github/dependabot.yml`) revisa semanalmente dependencias npm y GitHub Actions agrupando parches menores.

## 3. Secretos

```bash
pnpm secrets:check        # patrones de alta confianza sobre archivos versionados
```

Reglas: `.env` fuera de Git, `.env.example` sin valores reales, API keys sólo con prefijo identificable y nunca en `NEXT_PUBLIC_*`. El repositorio mantiene además el escaneo de GitGuardian documentado en `docs/deployment-f0.md`.

## 4. DAST smoke

```bash
pnpm security:dast
# DAST_BASE_URL=https://api.fabsoft.example pnpm security:dast
```

Comprueba cabeceras, CSP de la documentación, CORS, 401 sin credenciales, 401 con API key inválida, JSON inválido, cuerpo >100 KB (413) y rutas inexistentes. En CI se ejecuta como test Playwright (`e2e/smoke/security-dast.spec.ts`) con los servidores de la suite E2E; el script queda para staging/post-deploy (HT-08).

## 5. RLS y secretos en ejecución

- La suite `pnpm test:security` mantiene las comprobaciones `app.assert_rls_everywhere()`, roles sin `BYPASSRLS`, políticas y privilegios; ver `docs/testing-strategy.md`.
- `backend/tests/api/security-headers.test.ts` verifica cabeceras, CSP de docs, CORS y 413 sin base de datos.
- `frontend/src/shared/security/headers.test.ts` verifica la CSP/HSTS del frontend.

## 6. Verificación local

```bash
pnpm audit:dependencies
pnpm secrets:check
pnpm --filter @fabsoft/backend test -- tests/api/security-headers.test.ts
pnpm --filter @fabsoft/frontend test -- src/shared/security/headers.test.ts
pnpm build
```

Resultado en la validación del bloque: 3 advisories aceptados (sin high/critical nuevos), 483 archivos escaneados sin secretos, 4 tests de cabeceras API, 2 del frontend, 36 E2E passed + 6 skipped (capturas visuales) y DAST local en verde. La suite `test:security` ejecutada sobre una BD desechable `_test` dejó 127/148 en verde; los fallos restantes son del harness de mutaciones/seed CLI (subprocesos `undefined`, password del seed writer) y no de políticas RLS: `rls-effective`, `security-hardening`, vistas de integración, auditoría y roles pasaron.
