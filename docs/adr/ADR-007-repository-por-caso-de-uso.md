# ADR-007 — Repositorios por caso de uso (no CRUD genérico por tabla)

- **Estado:** Aceptada
- **Fecha:** 2026-11-01

## Contexto

El contexto técnico (§2.8, §3) pide *repository pattern* **por caso de uso** (p. ej. `findExpiring(days)`, `renew(id, period)`), descarta el CRUD genérico por tabla y pide centralizar `withRlsContext`. La decisión del dueño exige SOLID estricto (ISP/DIP) y portabilidad Supabase → VPS cambiando sólo infraestructura.

## Decisión

1. Cada caso de uso de `application/` declara **su propio puerto** (interfaz) con las operaciones mínimas que necesita, en términos de dominio. Ejemplo:

```ts
// application/subscriptions/renew-subscription/ports.ts
export interface RenewSubscriptionRepository {
  /** Carga con bloqueo (SELECT ... FOR UPDATE) la suscripción y su periodo vigente. */
  loadForRenewal(subscriptionId: SubscriptionId): Promise<SubscriptionForRenewal | null>;
  /** Persiste en una sola operación lógica: cierre del periodo actual, nuevo periodo y cabecera. */
  saveRenewal(change: RenewalChange): Promise<void>;
}

// application/subscriptions/list-expiring/ports.ts
export interface ExpiringSubscriptionsQuery {
  findExpiring(params: { today: LocalDate; withinDays: number; page: Page }): Promise<Paginated<ExpiringSubscriptionView>>;
}
```

2. Las implementaciones viven en `infrastructure/persistence/pg/<módulo>/` (`PgRenewSubscriptionRepository`, `PgExpiringSubscriptionsQuery`), escriben **SQL explícito** con `pg` (sin ORM) y reciben un `Tx` ya contextualizado.
3. La transacción y el contexto RLS se gestionan **una vez por caso de uso** mediante el puerto `UnitOfWork`:

```ts
export interface UnitOfWork<R> {
  run<T>(actor: ActorContext, work: (repos: R) => Promise<T>): Promise<T>;
}
// infra: PgUnitOfWork<R> = withRlsContext(toRlsContext(actor), tx => work(factory(tx)))
```

4. Lecturas (queries) y escrituras (commands) usan puertos distintos: las vistas de lectura devuelven DTOs/proyecciones listas para la API; las escrituras trabajan con entidades de dominio.
5. Prohibido: `BaseRepository<T>` con `findAll/findById/update/delete` genéricos, repositorios que devuelvan filas crudas a controladores, SQL en `application` o `interfaces`.
6. Se permite compartir *helpers* de mapeo y fragmentos SQL dentro de `infrastructure/persistence/pg/shared/`.

## Consecuencias

- (+) ISP: cada caso de uso depende sólo de lo que usa; tests con *fakes* en memoria triviales.
- (+) DIP: migrar a otro PostgreSQL (o a otro motor) sólo cambia `infrastructure/persistence`.
- (+) Consultas optimizadas por caso de uso (índices de `docs/data-model.md`).
- (−) Más interfaces pequeñas; se mitigan con una convención de carpetas estricta (`docs/architecture.md` §3).
