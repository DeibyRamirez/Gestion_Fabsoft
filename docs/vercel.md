# Despliegue en Vercel — FabSoft

> Respuesta corta: **el frontend Next.js sí puede correr en Vercel mañana**, pero el proyecto completo no se reduce a “subir el repo”. La API, el worker y PostgreSQL tienen requisitos distintos.

## 1. Qué puede ir en Vercel

| Componente | ¿Vercel? | Nota |
|---|---|---|
| Frontend Next.js (`frontend/`) | **Sí** | Es su caso ideal. `output: standalone` no estorba, pero Vercel usa su propio runtime. |
| API Express (`backend/src/main-api.ts`) | **Sí, con adaptación** | Puede ejecutarse como Vercel Function, pero hay que adaptar el entrypoint al modelo serverless y cuidar el pool de conexiones. |
| Worker pg-boss (`backend/src/main-worker.ts`) | **No** | Es un proceso persistente con cron, `LISTEN/NOTIFY`, locks y reintentos. Vercel no garantiza un proceso vivo. |
| PostgreSQL local en Docker | **No** | Debe ser PostgreSQL gestionado: Supabase, Neon, RDS, etc. |
| Migraciones dbmate | **Sí, como job externo** | No las ejecutes en el build de Vercel; usa CI o un job del proveedor de BD. |

## 2. Arquitectura recomendada

```text
Vercel
  └── Next.js frontend
        │ HTTPS
        ▼
API Express (Render / Railway / Fly.io / VPS / Vercel Functions)
        │
        ├── PostgreSQL gestionado (Supabase / Neon / RDS)
        │     ├── conexión pooled para la API (puerto 6543 en Supabase)
        │     └── conexión de sesión/directa para el worker (puerto 5432)
        │
        └── Worker persistente (mismo servicio de API o uno separado)
              └── pg-boss: expire, reconcile, dispatch, cleanup
                    └── Resend o SMTP
```

Opciones válidas:

- **Vercel (web) + Railway/Render (API + worker) + Supabase (BD).**
- **Vercel (web + API serverless) + Railway/Render (worker) + Neon/Supabase (BD).**
- **Vercel (web) + VPS (API + worker + PostgreSQL)** si se quiere mantener la infraestructura actual.

## 3. Variables que cambian respecto a local

### Frontend en Vercel

- `NEXT_PUBLIC_API_BASE_URL=https://api.tudominio.com/api/v1`
- No pongas secretos en variables `NEXT_PUBLIC_*`.

### API

- `APP_ENV=prod`
- `DB_PROVIDER=supabase` si usas Supabase; `postgres` si usas Neon/RDS/VPS.
- `DATABASE_URL` con el rol `fabsoft_app` y el pooler de la API.
- `DATABASE_SSL_MODE=verify-full` y `DATABASE_SSL_CA` con la CA del proveedor.
- `CORS_ALLOWED_ORIGINS=https://app.tudominio.com`
- `COOKIE_DOMAIN=.tudominio.com` o el dominio que corresponda.
- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEYS`, `JWT_ACTIVE_KID`.
- `API_KEY_PEPPER`, `API_KEY_ENV=live`.
- `OPENAPI_SPEC_PATH` sólo si la imagen/función no incluye `docs/api/openapi.json`.

### Worker

- `WORKER_DATABASE_URL` con el rol `fabsoft_worker` y conexión de **sesión/directa** (no el pooler de transacción).
- `DATABASE_SSL_MODE=verify-full` + `DATABASE_SSL_CA`.
- `CORREO_CANAL=resend|smtp|log`.
- `RESEND_API_KEY` o `SMTP_*` según el canal.
- `FRONTEND_URL=https://app.tudominio.com`.
- `BUSINESS_TIMEZONE=America/Bogota`.

## 4. Puntos que suelen romper el despliegue

1. **El worker no puede ser serverless.** Si Vercel duerme la función, pg-boss deja de procesar alertas y correos.
2. **El pooler de Supabase en modo transacción no sirve para pg-boss.** Usa sesión/directa para el worker.
3. **La API y el worker no comparten secretos.** Cada uno tiene su `DATABASE_URL`/`WORKER_DATABASE_URL`.
4. **Las migraciones no se ejecutan en el build.** Deben correr antes del despliegue, con `DATABASE_MIGRATION_URL`.
5. **La cookie `SameSite=Strict` exige el mismo sitio.** Usa `app.tudominio.com` y `api.tudominio.com`, o un proxy bajo el mismo dominio.
6. **CORS y `COOKIE_DOMAIN` deben coincidir** con el dominio real.
7. **No subas `.env`.** Configura las variables en el panel de Vercel y en el proveedor del worker.
8. **El límite de conexiones de Supabase/Neon es compartido.** Ajusta `DB_POOL_MAX` y no ejecutes el worker con el pool de la API.

## 5. Pasos mínimos para una prueba en Vercel

1. Crear PostgreSQL gestionado y aplicar migraciones (`db:migrate`) con el rol de migración.
2. Crear los roles runtime (`fabsoft_app`, `fabsoft_worker`) y darles LOGIN.
3. Instalar pg-boss en la BD (`db:pgboss:install`).
4. Desplegar el worker en un servicio persistente y verificar `worker.started`.
5. Desplegar la API con sus variables y probar `GET /api/v1/health/ready`.
6. Desplegar el frontend en Vercel con `NEXT_PUBLIC_API_BASE_URL`.
7. Probar login, refresh, CORS y una ruta autenticada.
8. Probar el flujo de alertas con `CORREO_CANAL=log` y luego con Resend/SMTP real.
9. Probar una integración externa con `X-Api-Key`.
10. Recién entonces considerar producción.

## 6. Qué no cambia

- El dominio, casos de uso, RLS, auditoría y OpenAPI son los mismos.
- El frontend no necesita Supabase Auth: la autenticación es propia (ADR-001/ADR-008).
- El worker sigue siendo el mismo proceso Node; sólo cambia dónde se ejecuta.
- El correo sigue detrás del puerto `EmailSender`; Vercel no envía correos por ti.
