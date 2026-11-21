# Despliegue y entornos — FabSoft

> Fase 1: API + worker + frontend en un VPS con Docker; BD en **Supabase**. Fase 2: BD **PostgreSQL 16 en VPS** (plan de migración: `docs/architecture.md` §7). Separación estricta dev / test / prod (§12 funcional). Guía operativa del VPS, compose, pipeline y rollback: [`docs/migracion-vps.md`](migracion-vps.md).

## 1. Entornos

| Entorno | Propósito | BD | Email | Datos |
|---|---|---|---|---|
| **dev** (local) | Desarrollo | `postgres:16` en docker-compose (`localhost:54320`) | `CORREO_CANAL=log` | Seed demo (`docs/seed-data.md`) |
| **test** (CI y local) | Tests automatizados | `postgres:16` efímero (`localhost:54329`, `tmpfs`) | `log` / fakes | Fábricas por test |
| **staging** (recomendado) | Validación previa a release, ensayo de migración | Proyecto Supabase separado (fase 1) / BD separada en VPS (fase 2) | Resend o SMTP con dominio de pruebas y lista blanca de destinatarios | Seed demo, nunca datos reales |
| **prod** | Operación | Supabase (fase 1) → VPS (fase 2) | Resend o SMTP con dominio verificado | Reales |

Cada entorno tiene sus **propios** secretos, claves JWT, pepper y proyecto/BD. Nunca se apunta un entorno no productivo a la BD de producción.

## 2. Variables de entorno

| Variable | Proceso | Ejemplo / nota |
|---|---|---|
| `NODE_ENV` | api, worker | `development` / `test` / `production` |
| `APP_ENV` | api, worker | `dev` / `test` / `staging` / `prod` (logs) |
| `APP_VERSION` | api | Opcional; default `0.1.0`, se muestra en `/health` |
| `PORT` | api | `4000` |
| `DB_PROVIDER` | api | `supabase` \| `postgres` (selecciona adaptador, ADR-008). El worker siempre usa conexión directa |
| `DATABASE_URL` | api | Rol `fabsoft_app` (sólo API; no se comparte con el worker). Supabase: `postgresql://fabsoft_app.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres` (modo transacción) |
| `WORKER_DATABASE_URL` | worker | Rol **`fabsoft_worker`** (separado desde `0003`; credencial propia, nunca la de la API). Supabase: mismo host puerto **5432** (modo sesión) o conexión directa |
| `DATABASE_MIGRATION_URL` | CI/CD (dbmate) | Rol propietario (`postgres` en Supabase, `fabsoft_owner` en VPS). Nunca en contenedores de la app |
| `DATABASE_SSL_MODE` / `DATABASE_SSL_CA` | api, worker | `verify-full` + CA de Supabase (fase 1); `disable` sólo en red local docker |
| `DB_POOL_MAX` | api, worker | api `10`, worker `4` (respetar límite del plan de Supabase) |
| `JWT_PRIVATE_KEY` | api | PEM Ed25519 |
| `JWT_PUBLIC_KEYS` | api | JWKS JSON (activa + anterior) |
| `JWT_ACTIVE_KID` | api | `2026-11` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | api | `fabsoft-api` / `fabsoft-web` |
| `ACCESS_TOKEN_TTL_SECONDS` | api | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | api | `14` |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | api | `20` por IP |
| `LOGIN_RATE_LIMIT_PER_EMAIL` | api | `5` por IP+email |
| `LOGIN_IP_FAILURE_THRESHOLD` | api | `10` fallos 401 por IP antes de bloquear |
| `LOGIN_IP_FAILURE_WINDOW_MINUTES` | api | `15` |
| `LOGIN_IP_BLOCK_MINUTES` | api | `15` |
| `API_KEY_PEPPER` (+ `API_KEY_PEPPER_PREVIOUS` opcional) | api | 32+ bytes aleatorios base64 |
| `API_KEY_ENV` | api | `live` (prod) / `test` (resto) → prefijo `fsk_live_`/`fsk_test_` |
| `CORS_ALLOWED_ORIGINS` | api | `https://app.fabsoft.example` |
| `COOKIE_DOMAIN` | api | `api.fabsoft.example` (host-only si se omite) |
| `BUSINESS_TIMEZONE` | worker | `America/Bogota`; sólo afecta los cron de pg-boss |
| `CORREO_CANAL` | worker | `log` \| `resend` \| `smtp` |
| `RESEND_API_KEY` | worker | Obligatoria con `CORREO_CANAL=resend` |
| `RESEND_MAX_RPS` | worker | `2` |
| `CORREO_DESDE` | worker | Remitente; obligatorio con `resend` o `smtp` |
| `SMTP_HOST` | worker | Obligatorio con `CORREO_CANAL=smtp` |
| `SMTP_PORT` | worker | `587` (465 si `SMTP_SECURE=true`) |
| `SMTP_SECURE` | worker | `false` en 587/STARTTLS; `true` en 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | worker | Opcionales; si se usan, deben configurarse juntos |
| `SMTP_REJECT_UNAUTHORIZED` | worker | `true`; no desactivar en producción |
| `FRONTEND_URL` | worker | Enlaces en correos |
| `OPENAPI_SPEC_PATH` | api | Opcional: ruta absoluta a `docs/api/openapi.json` si la imagen no incluye `docs/` |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | `https://api.fabsoft.example/api/v1` |

`backend/src/infrastructure/config/env.ts` valida las variables de la API al arrancar y aborta si falta algo. [`backend/.env.example`](../backend/.env.example) y [`frontend/.env.example`](../frontend/.env.example) documentan cada variable sin valores reales. En producción cada servicio recibe su propio conjunto (archivo env en el VPS, secretos del proveedor de BD, variables del panel de Vercel/Netlify para el frontend, etc.); no hay un `.env` unificado en la raíz del monorepo.

## 3. Desarrollo local (docker-compose)

```yaml
# docker-compose.yml (raíz del monorepo)
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: fabsoft_owner, POSTGRES_PASSWORD: dev_owner, POSTGRES_DB: fabsoft }
    ports: ["54320:5432"]
    volumes: [db-data:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U fabsoft_owner"], interval: 5s, retries: 10 }
  db-test:
    image: postgres:16
    environment: { POSTGRES_USER: fabsoft_owner, POSTGRES_PASSWORD: test_owner, POSTGRES_DB: fabsoft_test }
    ports: ["54329:5432"]
    tmpfs: [/var/lib/postgresql/data]
volumes:
  db-data:
```

Pasos: ver `README.md` raíz ("Cómo levantar el monorepo"). En local el usuario de la imagen es superusuario (equivale a propietario con BYPASSRLS); la app siempre se conecta como `fabsoft_app`.

## 4. Fase 1 — Supabase (BD) + VPS (API, worker, frontend)

### 4.1 Preparar Supabase
1. Crear proyecto (región más cercana a Colombia disponible, p. ej. `us-east-1`); anotar versión mayor de Postgres asignada (15–17; el SQL es compatible y CI prueba en 16).
2. En *Settings → Data API*: **no** añadir el esquema `app` a los esquemas expuestos.
3. Ejecutar migraciones desde CI/CD o una máquina de administración: `dbmate --url "$DATABASE_MIGRATION_URL" --migrations-dir backend/migrations up` (usuario `postgres`, conexión directa o pooler modo sesión).
4. Asignar contraseña de login al rol de la app (una vez, fuera de migraciones):
   ```sql
   alter role fabsoft_app login password '<generada-32+>';
   ```
5. Descargar la CA de Supabase y configurar `DATABASE_SSL_CA`.

### 4.2 VPS
- Ubuntu LTS, Docker Engine + Compose v2, firewall (sólo 22 con clave, 80, 443), actualizaciones automáticas de seguridad.
- `docker-compose.prod.yml` con servicios: `api` (imagen `backend`, `node dist/main-api.js`), `worker` (misma imagen, `node dist/main-worker.js`), `web` (imagen `frontend`, `output: standalone`), `proxy` (Caddy: TLS automático, `app.fabsoft.example` → web:3000, `api.fabsoft.example` → api:4000).
- Imágenes multi-stage `node:22-alpine`, usuario no root, `HEALTHCHECK` contra `/api/v1/health`.
- `trust proxy` = 1 en Express (IP real para rate limit y auditoría).
- Un único contenedor `worker` (pg-boss soporta varios, pero no es necesario).

### 4.3 Verificaciones post-despliegue (Supabase)
```sql
-- Debe devolver 0 filas: anon/authenticated sin privilegios en app
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'app' and grantee in ('anon', 'authenticated');
-- fabsoft_app sin BYPASSRLS
select rolname, rolbypassrls from pg_roles where rolname = 'fabsoft_app';
```
Más la checklist de aislamiento (`docs/security/threat-model.md` §5) contra staging.

### 4.4 Pipeline de release
1. CI verde (ver `docs/testing-strategy.md` §8).
2. Construir y etiquetar imágenes con el SHA.
3. `dbmate up` contra la BD del entorno (migraciones compatibles hacia atrás: *expand → migrate → contract*; nunca renombrar/borrar columnas en el mismo release que el código que deja de usarlas).
4. `docker compose pull && docker compose up -d` (api, worker, web).
5. *Smoke test*: `/api/v1/health/ready`, login, listado.
6. DAST smoke contra staging: `DAST_BASE_URL=https://api.fabsoft.example pnpm security:dast` (cabeceras, CORS, límites y errores).
7. Rollback: volver a la imagen anterior (las migraciones *expand* lo permiten).

## 5. Fase 2 — PostgreSQL 16 en VPS

- Servicio `db` (`postgres:16`) en el mismo VPS o en uno dedicado de red privada; volumen en disco persistente; no expuesto a Internet.
- Roles: `fabsoft_owner` (LOGIN, BYPASSRLS, propietario; sólo migraciones) `fabsoft_app` (creado por `0002_rls.sql`, LOGIN asignado manualmente; API), `fabsoft_worker` (creado por `0003_security_hardening.sql`, LOGIN asignado manualmente; worker, propietario de `pgboss`) y `fabsoft_secure_view` (NOLOGIN).
- dbmate: usar `--migrations-table public.schema_migrations` (las migraciones fijan `search_path = app`; sin esto `0001` falla con `relation "app.schema_migrations" does not exist`).
- Parámetros iniciales: `max_connections=100`, `shared_buffers=25% RAM`, `log_min_duration_statement=500ms`, `timezone='UTC'`.
- **Backups:**
  - `pg_dump -Fc` diario (03:00 Bogotá) cifrado y copiado fuera del VPS (almacenamiento de objetos), retención 30 días.
  - Archivado WAL continuo (p. ej. `wal-g` o `pgBackRest`) para PITR de 7 días.
  - Prueba de restauración mensual en staging documentada.
- Cambio de adaptador: `DB_PROVIDER=postgres`, nuevas `DATABASE_URL`/`WORKER_DATABASE_URL` (procedimiento completo y rollback en `docs/architecture.md` §7).
- Nota de volcado desde Supabase: requiere un rol con `BYPASSRLS` (el `postgres` de Supabase) porque todas las tablas tienen `FORCE ROW LEVEL SECURITY`.

## 6. Dominio y TLS

- `app.<dominio>` (frontend) y `api.<dominio>` (API) bajo el mismo dominio registrable para que la cookie `SameSite=Strict` del refresh funcione (mismo *site*).
- HSTS (`helmet`) con `max-age=31536000; includeSubDomains` tras validar TLS.

### 6.1 Cookie `Secure` del refresh (`fs_rt`)

- La cookie `fs_rt` se emite siempre con `Secure; HttpOnly; SameSite=Strict; Path=/api/v1/auth` (salvo `APP_ENV=test`, donde supertest usa HTTP sin cookie jar seguro).
- **Local (dev):** funciona sin TLS porque los navegadores tratan `http://localhost` como contexto seguro. Usar `localhost` (no `127.0.0.1` ni la IP de la LAN) en `FRONTEND_URL`, `NEXT_PUBLIC_API_BASE_URL` y `CORS_ALLOWED_ORIGINS`; frontend `:3000` y API `:4000` son el mismo *site*.
- **Staging y prod:** requiere HTTPS en `app.<dominio>` y `api.<dominio>` (ver arriba); por HTTP el navegador descarta la cookie y el refresh falla con 401.

## 7. Roles de BD con LOGIN (fuera de migraciones)

Las migraciones crean `fabsoft_app`, `fabsoft_worker` (0003), `fabsoft_secure_view` (0003), `fabsoft_auth_definer` y `fabsoft_bootstrap` (0005) **sin LOGIN ni contraseña**. Las credenciales nunca van en el repo ni en migraciones: se generan y guardan en el gestor de secretos del entorno (uno por entorno: dev/test/staging/prod).

### 7.1 Dar LOGIN a `fabsoft_worker` (y `fabsoft_app`)

1. Generar la contraseña **en el gestor de secretos** (≥ 32 caracteres aleatorios), p. ej. secreto `fabsoft/<entorno>/db/fabsoft_worker`.
2. Ejecutarlo con el rol propietario (`DATABASE_MIGRATION_URL`), leyendo el valor del gestor sin dejarlo en el historial del shell ni en logs de CI (variable enmascarada):
   ```sql
   -- psql: \set pwd `printenv FABSOFT_WORKER_DB_PASSWORD`
   alter role fabsoft_worker login password :'pwd' connection limit 10;
   alter role fabsoft_worker set statement_timeout = '60s';
   ```
   `fabsoft_worker` no tiene BYPASSRLS ni CREATE en la BD; sólo es propietario del esquema `pgboss`.
3. Componer `WORKER_DATABASE_URL` en el gestor y montarla **sólo** en el contenedor del worker. La API usa `DATABASE_URL` con `fabsoft_app` (mismo procedimiento con su propio secreto). `worker-env.ts` rechaza un `WORKER_DATABASE_URL` que no use `fabsoft_worker`.
4. Instalar las tablas de pg-boss con el rol propietario **una vez por base** antes de arrancar el worker (pg-boss no puede crear el esquema si el worker no tiene `CREATE ON DATABASE`):
   ```bash
   DATABASE_PROVISION_URL=postgres://fabsoft_owner:...@host:5432/fabsoft \
     pnpm --filter @fabsoft/backend db:pgboss:install
   ```
   El script crea las tablas en `pgboss`, las reasigna a `fabsoft_worker` y concede DML a `fabsoft_app`.

**Supabase (fase 1):**
- Ejecutar el `ALTER ROLE` desde el SQL Editor o con `psql` usando la conexión directa del rol `postgres` (no el pooler en modo transacción).
- Usuario del pooler (Supavisor): `fabsoft_worker.<project-ref>`; puerto **5432** (modo sesión, requerido por pg-boss) o conexión directa. Ej.: `postgresql://fabsoft_worker.<ref>:<secreto>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full`.
- Verificar: `select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname like 'fabsoft_%';` ⇒ `fabsoft_worker` con `rolcanlogin = true`, `rolbypassrls = false`.

**VPS (fase 2):**
- Ejecutar con `fabsoft_owner`. En `pg_hba.conf` permitir `fabsoft_worker` sólo desde la red privada de los contenedores con `scram-sha-256` (`password_encryption = scram-sha-256`).
- `WORKER_DATABASE_URL=postgresql://fabsoft_worker:<secreto>@db:5432/fabsoft?sslmode=<disable en red docker local | verify-full si cruza red>`.

### 7.2 Rotación (cada 6 meses o ante sospecha; threat-model §4)

1. Generar nueva versión del secreto en el gestor.
2. `alter role fabsoft_worker password :'pwd_nueva';` (las conexiones abiertas siguen vivas; las nuevas exigen la nueva).
3. Actualizar `WORKER_DATABASE_URL` y reiniciar sólo el worker; comprobar `GET /api/v1/health/ready` y que pg-boss procesa trabajos.
4. Retirar la versión anterior del gestor. Ante compromiso: además `select pg_terminate_backend(pid) from pg_stat_activity where usename = 'fabsoft_worker';`.

### 7.3 Primer administrador (`app.bootstrap_first_admin`, 0005)

`fabsoft_bootstrap` es NOLOGIN y es el único con EXECUTE sobre `app.bootstrap_first_admin` (que falla si ya existe un admin). El alta es interactiva y no guarda la contraseña en disco:

1. Preparar una conexión temporal, según el entorno:
   - **Opción A (recomendada en local):** `BOOTSTRAP_DATABASE_URL` con el rol `fabsoft_bootstrap` y LOGIN temporal.
   - **Opción B (Neon/VPS):** usar `DATABASE_PROVISION_URL` y ejecutar `grant fabsoft_bootstrap to <rol_propietario>;` para que el script pueda hacer `SET LOCAL ROLE fabsoft_bootstrap`.
2. Ejecutar:
   ```bash
   pnpm --filter @fabsoft/backend primeradmin:db
   ```
   El comando pide correo, nombre completo, contraseña y confirmación. Calcula el hash Argon2id y llama a `app.bootstrap_first_admin`; la contraseña en claro no se escribe en logs, archivos ni argumentos de shell.
3. El primer login exigirá cambiar la contraseña (`must_change_password=true`).
4. Revocar el acceso temporal: `alter role fabsoft_bootstrap nologin password null;` o `revoke fabsoft_bootstrap from <rol>;`.

## 8. Primer despliegue limpio (sin datos seed)

Las migraciones sólo crean datos de referencia necesarios (`alert_rules` y `app_settings.contact_channel`). **No crean usuarios, clientes, productos ni suscripciones demo.**

- `pnpm db:seed` es exclusivo de dev/test; falla si `APP_ENV=prod` y valida hosts/BD permitidos. **No lo ejecutes en Neon, Render ni producción.**
- Antes del primer admin, verifica que la base esté limpia:
  ```bash
  pnpm --filter @fabsoft/backend db:verify:empty -- --before-admin
  ```
  Debe fallar si encuentra usuarios `@fabsoft.test`, clientes demo o cualquier dato de negocio.
- Crea el primer admin con `pnpm --filter @fabsoft/backend primeradmin:db`.
- Después del bootstrap, verifica que sólo exista ese admin:
  ```bash
  pnpm --filter @fabsoft/backend db:verify:empty -- --after-admin
  ```
- Si el check falla, no despliegues: revisa si alguien ejecutó el seed o si la BD no es la correcta.

## 9. Despliegue alternativo en Vercel

El frontend Next.js puede desplegarse en Vercel, pero la API, el worker pg-boss y PostgreSQL tienen requisitos distintos. Guía completa: [`docs/vercel.md`](vercel.md).

Resumen:
- Vercel: frontend y, opcionalmente, API como función serverless.
- Worker: proceso persistente en Render/Railway/Fly/VPS; no serverless.
- BD: PostgreSQL gestionado (Supabase/Neon/RDS), no el Docker local.
- Migraciones: job externo con `DATABASE_MIGRATION_URL`, nunca en el build de Vercel.
