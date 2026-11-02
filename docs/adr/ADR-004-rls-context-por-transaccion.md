# ADR-004 — Contexto RLS fijado por transacción (`withRlsContext`)

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Implementación:** `backend/migrations/0002_rls.sql`, `backend/src/infrastructure/db/with-rls-context.ts`

## Contexto

El funcional exige aislamiento entre clientes comprobado en servidor (§5, RN-11, RN-12) y recomienda RLS (§12). El contexto técnico (§2.5) pide "RLS por tabla, pero RLS no reemplaza la autorización en aplicación" y un contrato `withRlsContext(userId, fn)` con `SET LOCAL` por transacción.

El backend se conecta con un **único rol de BD** (`fabsoft_app`) a través de un pool. En Supabase el pooler (Supavisor, modo transacción) y en VPS el pool de `pg` reutilizan conexiones entre peticiones: cualquier variable de sesión (`SET` sin `LOCAL`) se filtraría a la siguiente petición. Además, las políticas no pueden usar `auth.uid()` porque no se usa Supabase Auth (ADR-001) y deben funcionar en PostgreSQL puro.

## Decisión

1. **Toda** consulta de la aplicación se ejecuta dentro de `withRlsContext(ctx, fn)`. No existe otra forma de obtener una conexión desde las capas `application` o `interfaces` (el pool no se exporta fuera de `infrastructure/db`).
2. `withRlsContext` abre `BEGIN`, fija las variables con `select set_config(name, value, true)` (= `SET LOCAL`, admite parámetros enlazados, evita inyección), ejecuta `fn(tx)` y hace `COMMIT`/`ROLLBACK`. Las variables desaparecen al terminar la transacción.
3. Variables: `app.actor_type`, `app.actor_role`, `app.current_user_id`, `app.client_id`, `app.integration_id`, `app.request_id`; además `statement_timeout` local (5 s en API, 60 s en jobs).
4. Las políticas leen el contexto con funciones `app.ctx_*()` que devuelven `NULL` si la variable falta o está vacía: **sin contexto no hay filas** (deny by default).
5. `FORCE ROW LEVEL SECURITY` en todas las tablas: ni el propietario las salta (sólo el rol migrador con `BYPASSRLS`, que la aplicación no usa).
6. Contexto `system` (`actor_type=system`, `actor_role=system`) reservado a: autenticación (búsqueda de usuario por email, verificación de API key por prefijo, refresh tokens) y jobs del worker. Sólo se construye en `infrastructure` mediante fábricas `SystemContext.auth()` / `SystemContext.worker()`; ningún controlador puede crearlo.
7. RLS es **la segunda barrera**. La primera es la capa `application`: guardas de rol, scopes, columnas sensibles (precio/costo sólo admin), máquina de estados y proyecciones DTO (p. ej. el portal nunca selecciona `supplier_cost_amount` ni `notes`).

### Contrato (TypeScript)

```ts
export type RlsContext =
  | { actorType: 'user'; userId: string; role: 'admin' | 'operator'; clientId: null; requestId: string }
  | { actorType: 'user'; userId: string; role: 'client'; clientId: string; requestId: string }
  | { actorType: 'integration'; integrationId: string; requestId: string }
  | { actorType: 'system'; purpose: 'auth' | 'worker' | 'maintenance'; requestId: string };

/**
 * Garantías:
 *  - Una transacción por llamada; variables con alcance LOCAL a esa transacción.
 *  - `tx` deja de ser utilizable al terminar (lanza `TxClosedError`).
 *  - No admite anidamiento: llamar dentro de otro withRlsContext lanza `NestedRlsContextError`.
 *  - Error en fn ⇒ ROLLBACK y relanza; la conexión siempre se libera.
 *  - Error de serialización (40001) o deadlock (40P01) ⇒ reintento hasta 3 veces con backoff 50/100/200 ms.
 */
export function withRlsContext<T>(ctx: RlsContext, fn: (tx: Tx) => Promise<T>): Promise<T>;
```

```sql
-- Primera sentencia de cada transacción (una sola ida y vuelta)
select set_config('app.actor_type',      $1, true),
       set_config('app.actor_role',      $2, true),
       set_config('app.current_user_id', coalesce($3, ''), true),
       set_config('app.client_id',       coalesce($4, ''), true),
       set_config('app.integration_id',  coalesce($5, ''), true),
       set_config('app.request_id',      $6, true),
       set_config('statement_timeout',   $7, true);
```

## Alternativas consideradas

| Alternativa | Motivo de descarte |
|---|---|
| `SET` de sesión al tomar la conexión | Se filtra entre peticiones con pooling (Supavisor modo transacción / pool `pg`). |
| Un rol de BD por usuario | Inviable con pool y con usuarios del portal; complica migración. |
| Sólo autorización en aplicación | Un bug en un repositorio expondría datos de otro cliente; el contexto técnico exige RLS por tabla. |
| `auth.uid()` de Supabase | No portable a PostgreSQL puro; implica Supabase Auth (descartado en ADR-001). |
| Service role / BYPASSRLS para la API | Anula RLS; prohibido. |

## Consecuencias

- (+) Aislamiento por cliente e integración aplicado por la BD aun con errores en repositorios.
- (+) Funciona igual en Supabase y en VPS; compatible con el pooler en modo transacción.
- (−) Toda unidad de trabajo es transaccional (coste mínimo con este volumen).
- (−) Las inserciones en `audit_logs` desde integraciones no deben usar `RETURNING` (no tienen política SELECT sobre esa tabla).

## Verificación

Suite `backend/tests/security/rls-isolation.test.ts` (ver `docs/testing-strategy.md` §5): sin contexto ⇒ 0 filas; cliente A no ve ni inserta datos de B; integración `own` sólo ve sus clientes; operador no archiva clientes ni cancela suscripciones; nadie borra tablas históricas; contexto `system` no se obtiene sólo con `actor_role`.
