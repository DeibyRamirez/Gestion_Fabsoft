# ADR-001 — JWT para humanos y API keys hasheadas para integraciones

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Relacionadas:** ADR-004 (contexto RLS), ADR-008 (backend propio), `docs/security/threat-model.md`

## Contexto

Hay dos tipos de actor que llaman al backend:

1. **Humanos** (admin, operador, usuario cliente) desde el frontend Next.js.
2. **Aplicaciones externas** (integraciones) que consumen `/api/v1`.

El documento funcional (§5) exige que cada integración tenga identidad, credenciales y permisos propios y que **nunca** use credenciales de un humano; también exige revocación de credenciales (§6.9). El contexto técnico (§2.5, advertencia 2) señala que un JWT stateless no se puede revocar.

Como el backend es propio y portable (ADR-008), **no** se usa Supabase Auth: la emisión y verificación de credenciales vive en el backend y funciona igual sobre Supabase o PostgreSQL en VPS.

## Decisión

### Humanos: access token JWT corto + refresh token opaco rotativo

| Elemento | Valor |
|---|---|
| Contraseñas | `argon2id` (librería `argon2`), parámetros: `memoryCost=19456 KiB`, `timeCost=2`, `parallelism=1` (mínimo OWASP). |
| Access token | JWT firmado con **EdDSA (Ed25519)** usando `jose`. TTL **15 min**. |
| Claims | `iss=fabsoft-api`, `aud=fabsoft-web`, `sub=<users.id>`, `role`, `cid` (client_id, sólo rol `client`), `jti`, `iat`, `exp`. Cabecera `kid`. |
| Transporte del access | `Authorization: Bearer <jwt>`. El frontend lo guarda **sólo en memoria**. |
| Refresh token | 32 bytes aleatorios (base64url), guardado como **SHA-256** en `refresh_tokens.token_hash`. TTL **14 días**. |
| Transporte del refresh | Cookie `fs_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. |
| Rotación | Cada `POST /api/v1/auth/refresh` revoca el token usado (`revoked_reason='rotated'`, `replaced_by`) y emite uno nuevo en la misma `family_id`. |
| Reutilización | Si llega un refresh ya revocado → se revoca **toda la familia** (`reuse_detected`) y se audita `auth.refresh_reuse_detected`. |
| Revocación inmediata | El middleware de autenticación recarga `users.status/role/client_id` en cada petición (equipo de 2–5 personas + portal: coste despreciable). Usuario desactivado o con rol cambiado deja de operar en la siguiente petición sin esperar a que expire el JWT; no hace falta lista negra de `jti`. |
| Rotación de claves | `JWT_ACTIVE_KID` firma; `JWT_PUBLIC_KEYS` (JWKS) contiene la clave activa y la anterior durante ≥ 15 min. |

### Integraciones: API key opaca, hasheada, con scopes

| Elemento | Valor |
|---|---|
| Formato | `fsk_<live|test>_<prefijo8>_<secreto43>` (secreto = 32 bytes base64url). |
| Almacenamiento | `api_credentials.key_prefix` (público, único) + `key_hash = HMAC-SHA256(secreto, API_KEY_PEPPER)` en hex. **Nunca texto plano**; el secreto se muestra una sola vez al crearlo. |
| Por qué HMAC y no argon2 | La clave tiene 256 bits de entropía: no es atacable por diccionario, y la verificación ocurre en cada petición. El *pepper* fuera de la BD impide verificar claves con un volcado de BD robado. |
| Transporte | Cabecera `X-Api-Key`. No se acepta en query string. |
| Verificación | Búsqueda por prefijo (contexto `system`), comparación con `crypto.timingSafeEqual`, comprobación de `revoked_at`, `expires_at` e `integrations.status='active'`. |
| Autorización | Scopes del manifest (`integrations.scopes`) + alcance de clientes (`client_scope` `all`/`own` con `integration_clients`). |
| Revocación | `POST /api/v1/integrations/{id}/credentials/{credentialId}/revoke` → efecto inmediato. Se permiten 2 credenciales activas por integración para rotar sin corte. |
| Uso | `last_used_at`/`last_used_ip` en `api_credentials` e `integrations.last_used_at`, actualizados como máximo 1 vez por minuto por credencial. |

### Separación estricta

- Un JWT nunca autoriza rutas de integración con scopes y una API key nunca obtiene un rol humano.
- Si una petición trae **ambos** (`Authorization` y `X-Api-Key`) se rechaza con `400 ambiguous_credentials`.
- Las tablas están separadas (`users`/`refresh_tokens` vs `integrations`/`api_credentials`) y el `actor_type` del contexto RLS es distinto (`user` vs `integration`).

## Alternativas consideradas

| Alternativa | Motivo de descarte |
|---|---|
| Supabase Auth (GoTrue) | Acopla a Supabase; las políticas dependerían de `auth.uid()` y la migración a VPS obligaría a reimplementar auth y migrar `auth.users`. Contradice ADR-008. |
| JWT largo sin refresh | No permite revocación (advertencia 2 del contexto técnico). |
| Sesiones con cookie de servidor para todo | Válido para humanos, pero no sirve para integraciones y obliga a CSRF en toda la API. |
| OAuth2 client credentials para integraciones | Sobredimensionado para "un puñado de integraciones"; se puede añadir después sin romper el modelo de scopes. |
| API keys con bcrypt/argon2 | Coste de CPU en cada petición sin beneficio con claves de alta entropía. |

## Consecuencias

- (+) Revocación inmediata para humanos e integraciones; credenciales sin secretos en BD; portable.
- (+) Auditoría diferenciada por `actor_type`.
- (−) El backend implementa login, cambio y reseteo de contraseña (admin), rotación de refresh y gestión de claves JWT.
- (−) La cookie `SameSite=Strict` requiere que frontend y API compartan sitio (subdominios del mismo dominio, ver `docs/deployment.md`).

## Verificación

Tests: `T-AUTH-01` (refresh rotativo), `T-AUTH-02` (reuse detection revoca familia), `T-AUTH-03` (usuario desactivado → 401 con JWT vigente), `T-API-01` (API key revocada → 401), `T-API-02` (ambas credenciales → 400), `T-API-03` (la API key nunca aparece en logs/auditoría). Ver `docs/testing-strategy.md`.
