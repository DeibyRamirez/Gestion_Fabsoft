# Despliegue y migración a VPS (HT-08)

> Ruta de producción: **VPS Linux + Docker Compose + PostgreSQL 16 local + Caddy TLS**. La API, el worker y el frontend usan imágenes separadas; la base de datos no se publica a Internet.

## 1. Arquitectura del despliegue

```text
Internet
  │  80/443 (Caddy, TLS automático)
  ├── app.<dominio> ──> web:3000   (Next.js standalone)
  └── api.<dominio> ──> api:4000   (Express)
                         │
                         ├── worker (misma imagen API, dist/main-worker.js)
                         └── db:5432 (PostgreSQL 16, sólo red interna)
```

- `docker-compose.prod.yml` define `db`, `api`, `worker`, `web`, `caddy` y el perfil `tools` (`migrate`).
- API y worker corren como usuario `node`, sin capabilities y con `no-new-privileges`.
- Caddy es el único servicio con puertos publicados; `db` sólo está en la red `internal`.
- La imagen API incluye `docs/api/openapi.json`; Swagger UI funciona en `/api/v1/docs`.

## 2. Prerrequisitos

- VPS Ubuntu LTS (22.04/24.04) con 2 vCPU y 4 GB RAM mínimos (8 GB recomendado con PostgreSQL).
- Docker Engine ≥ 24 y Docker Compose v2.
- DNS: registros `A` de `app.<dominio>` y `api.<dominio>` apuntando al VPS; ambos bajo el mismo dominio registrable.
- Puertos 22 (restringido a IPs de administración), 80 y 443 abiertos.
- Repositorio clonado en `/opt/fabsoft` y un usuario de despliegue con acceso a Docker.
- Cuenta/paquete de GitHub Container Registry (GHCR) con permiso de lectura para el VPS.

## 3. Preparar el VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # cerrar y volver a entrar
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable

sudo mkdir -p /opt/fabsoft
sudo chown "$USER":"$USER" /opt/fabsoft
git clone <repo> /opt/fabsoft
cd /opt/fabsoft
```

Crear los archivos de entorno **fuera de Git**:

```bash
cp deploy/.env.example deploy/.env
for f in deploy/env/*.example; do cp "$f" "${f%.example}"; done
chmod 600 deploy/.env deploy/env/*.env
```

Editar:

| Archivo | Contenido |
|---|---|
| `deploy/.env` | imágenes GHCR (`API_IMAGE`, `WEB_IMAGE`, `TOOLS_IMAGE`) y `NEXT_PUBLIC_API_BASE_URL` para builds locales |
| `deploy/env/db.env` | `POSTGRES_USER=fabsoft_owner`, contraseña fuerte, `POSTGRES_DB=fabsoft` |
| `deploy/env/api.env` | `APP_ENV=prod`, `DATABASE_URL` (`fabsoft_app`), JWT, pepper, CORS, límites |
| `deploy/env/worker.env` | `WORKER_DATABASE_URL` (`fabsoft_worker`), Resend y frecuencia |
| `deploy/env/tools.env` | `DATABASE_PROVISION_URL`/`DATABASE_MIGRATION_URL` con `fabsoft_owner`, bootstrap |
| `deploy/env/caddy.env` | dominios y email ACME |

Secretos mínimos: contraseñas de roles, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEYS`, `API_KEY_PEPPER`, `RESEND_API_KEY`, `GHCR_READ_TOKEN` (sólo CI/VPS). No reutilizar valores de dev/test.

## 4. Primera instalación (base nueva)

1. **Levantar PostgreSQL**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d db
   docker compose -f docker-compose.prod.yml ps
   ```
2. **Aplicar migraciones** con el propietario (el VPS no usa el harness `fabsoft_migrator` de CI):
   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate \
     sh -lc 'pnpm --filter @fabsoft/backend exec dbmate --url "$DATABASE_MIGRATION_URL" \
       --migrations-dir migrations --migrations-table public.schema_migrations \
       --no-dump-schema up'
   ```
3. **Habilitar LOGIN de runtime** (las migraciones crean roles NOLOGIN):
   ```bash
   docker compose -f docker-compose.prod.yml exec db \
     psql -U fabsoft_owner -d fabsoft
   ```
   ```sql
   alter role fabsoft_app login password '<secreto-app>';
   alter role fabsoft_worker login password '<secreto-worker>' connection limit 10;
   alter role fabsoft_worker set statement_timeout = '60s';
   ```
   Actualizar `DATABASE_URL`/`WORKER_DATABASE_URL` en los env y reiniciar API/worker.
4. **Instalar pg-boss** (idempotente, una vez por base):
   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate \
     pnpm --filter @fabsoft/backend db:pgboss:install
   ```
5. **Crear el primer admin** desde `fabsoft_bootstrap` (procedimiento completo en `docs/deployment.md` §7.3). Habilitar el rol sólo durante la operación y volver a `NOLOGIN` al terminar:
   ```sql
   alter role fabsoft_bootstrap login password '<temporal>';
   -- ejecutar admin:create con BOOTSTRAP_DATABASE_URL apuntando a fabsoft_bootstrap
   alter role fabsoft_bootstrap nologin password null;
   ```
   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate \
     pnpm --filter @fabsoft/backend admin:create --email admin@<dominio> --name "Admin"
   ```
   La contraseña temporal se muestra una vez (o se guarda en archivo `0600`); el primer login obliga a cambiarla.
6. **Levantar la aplicación**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d api worker web caddy
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs -f api worker
   ```

Caddy obtiene el certificado automáticamente. Comprobar `https://app.<dominio>` y `https://api.<dominio>/api/v1/health`.

## 5. Migración desde Supabase

Ventana de mantenimiento: congelar escrituras (worker detenido, integraciones pausadas) y hacer backup verificable de Supabase.

1. **Backup origen**:
   ```bash
   pg_dump --format=custom --no-owner --schema=app --file=fabsoft-app.dump "$SUPABASE_DB_URL"
   ```
   Usar un rol con `BYPASSRLS` (el `postgres` de Supabase).
2. **Esquema destino**: ejecutar migraciones en el VPS (paso 4.2) antes de restaurar datos.
3. **Restaurar datos** (el propietario local es superusuario del contenedor; necesario para deshabilitar triggers):
   ```bash
   docker compose -f docker-compose.prod.yml exec -T db \
     pg_restore --data-only --schema=app --disable-triggers --no-owner --dbname=fabsoft \
     < fabsoft-app.dump
   ```
   Verificar secuencias (`setval`) y FKs; el dump de Supabase puede requerir `--no-acl`.
4. **Integridad**:
   ```bash
   docker compose -f docker-compose.prod.yml exec db \
     psql -U fabsoft_owner -d fabsoft -c 'select app.assert_rls_everywhere();'
   ```
   Comparar conteos de `clients`, `subscriptions`, `subscription_periods`, `users`, `audit_logs` y `notifications` contra Supabase.
5. **Corte**: actualizar DNS, arrancar API/worker, ejecutar smoke y DAST; dejar Supabase en sólo lectura durante el período de rollback acordado.
6. **Rollback**: si falla la validación, volver DNS a Supabase, reactivar escrituras allí y conservar el dump/VPS para diagnóstico. No borrar el origen hasta cerrar la ventana.

Los pasos detallados de dump/restore y rollback de esquema están en `docs/architecture.md` §7; este documento fija la operación del VPS.

## 6. Pipeline de deploy

`.github/workflows/deploy.yml` se dispara con `workflow_dispatch` o un tag `v*`:

1. Construye y publica en GHCR `fabsoft-api`, `fabsoft-tools` y `fabsoft-web` con el SHA como tag.
2. Entra al VPS por SSH, hace login en GHCR y ejecuta `docker compose pull`.
3. Aplica migraciones `dbmate` y `db:pgboss:install`.
4. Recrea `api`, `worker`, `web` y `caddy` con `--no-build`.
5. El job `smoke` ejecuta `scripts/smoke-deploy.mjs` y `scripts/security-dast.mjs` contra las URLs públicas.

Variables de GitHub:

| Tipo | Nombre | Uso |
|---|---|---|
| Variable | `NEXT_PUBLIC_API_BASE_URL` | URL pública de la API (build del frontend) |
| Variable | `VPS_APP_DIR` | Directorio del checkout en el VPS (por defecto `/opt/fabsoft`) |
| Variable | `PRODUCTION_API_URL` / `PRODUCTION_WEB_URL` | Smoke y DAST |
| Secreto | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_FINGERPRINT` | Acceso SSH |
| Secreto | `GHCR_READ_TOKEN` | Lectura de imágenes privadas en el VPS |
| Secreto | `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD` | Login opcional del smoke |

El VPS debe tener el checkout y los archivos `deploy/env/*.env`; el workflow no transporta secretos al repositorio.

**Rollback de release**: conservar los tags SHA anteriores y ejecutar en el VPS:

```bash
API_IMAGE=ghcr.io/<owner>/fabsoft-api:<sha-anterior> \
WEB_IMAGE=ghcr.io/<owner>/fabsoft-web:<sha-anterior> \
TOOLS_IMAGE=ghcr.io/<owner>/fabsoft-tools:<sha-anterior> \
docker compose -f docker-compose.prod.yml up -d --no-build api worker web caddy
```

Las migraciones son *expand-only*; si una migración no es compatible hacia atrás, restaurar el backup anterior (no improvisar `down` en producción).

## 7. Smoke y verificación

Desde una máquina con Node 22:

```bash
SMOKE_API_URL=https://api.<dominio> \
SMOKE_WEB_URL=https://app.<dominio> \
SMOKE_ADMIN_EMAIL=admin@<dominio> \
SMOKE_ADMIN_PASSWORD='<secreto>' \
pnpm smoke:deploy

DAST_BASE_URL=https://api.<dominio> \
DAST_ALLOWED_ORIGIN=https://app.<dominio> \
pnpm security:dast
```

Comprobar además:

- `docker compose ps` sin reinicios y healthchecks sanos.
- `docker compose logs api worker` sin secretos ni errores 5xx.
- Login, refresh y una operación de lectura/escritura real.
- `GET /api/v1/health/ready` con `status: ok`.
- `select app.assert_rls_everywhere();` y checklist de `docs/security/threat-model.md` §5.
- TLS y HSTS en ambos dominios.

## 8. Backups y restauración

`deploy/backup-db.sh` genera un dump comprimido y lo cifra si se define `BACKUP_PASSPHRASE`:

```bash
BACKUP_PASSPHRASE='<secreto>' APP_DIR=/opt/fabsoft /opt/fabsoft/deploy/backup-db.sh
```

Programar en cron (03:15 Bogotá = 08:15 UTC) y copiar el archivo fuera del VPS (almacenamiento de objetos cifrado):

```cron
15 8 * * * BACKUP_PASSPHRASE='<secreto>' APP_DIR=/opt/fabsoft /opt/fabsoft/deploy/backup-db.sh >> /var/log/fabsoft-backup.log 2>&1
```

Retención local por defecto: 30 días. Probar una restauración mensual en staging:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -in fabsoft-<fecha>.dump.enc -out restore.dump -pass env:BACKUP_PASSPHRASE
docker compose -f docker-compose.prod.yml exec -T db pg_restore --clean --if-exists -U fabsoft_owner -d fabsoft < restore.dump
```

No restaurar sobre producción sin backup previo y ventana autorizada.

## 9. Operación y seguridad

- Rotar contraseñas de BD, JWT, pepper y Resend según `docs/security/threat-model.md` §4; reiniciar sólo el servicio afectado.
- Mantener el VPS actualizado; `docker compose pull` + `up -d` en ventanas de release.
- No publicar `db` ni `pgboss`; no abrir el puerto 5432.
- Revisar `docs/security/hardening.md` y ejecutar `pnpm audit:dependencies`, `pnpm secrets:check` y DAST en cada release.
- Los logs de contenedores rotan a 10 MB × 5; enviarlos al colector si se habilita observabilidad externa.
