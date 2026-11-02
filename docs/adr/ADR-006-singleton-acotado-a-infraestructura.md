# ADR-006 — Singleton acotado a infraestructura sin estado de usuario

- **Estado:** Aceptada
- **Fecha:** 2026-11-01

## Contexto

El contexto técnico (§2.8, §3) admite el patrón *singleton* sólo para infraestructura sin estado de usuario (pool de BD, cliente Resend, logger) y lo prohíbe para lógica de negocio o contexto de usuario porque rompe RLS y testabilidad.

## Decisión

1. **Singletons permitidos** (una instancia por proceso, creada en la *composition root* `backend/src/composition/container.ts`, nunca con `getInstance()` global):
   - `pg.Pool` de la API y del worker (`infrastructure/db/pool.ts`).
   - Instancia `PgBoss`.
   - Cliente `Resend` (dentro de `ResendEmailSender`).
   - Logger raíz `pino` (los *child loggers* por petición sí son por petición).
   - Configuración validada (`config/env.ts`, objeto inmutable `Object.freeze`).
   - Claves JWT cargadas (`JoseTokenService`).
2. **Prohibido como singleton o estado de módulo:** casos de uso con datos de usuario, el `RlsContext`, transacciones, repositorios ligados a una transacción, caches de permisos por usuario, `AsyncLocalStorage` usado para "inyectar" usuario en repositorios. El contexto viaja **explícitamente** como parámetro (`withRlsContext(ctx, ...)`, `useCase.execute(actor, input)`).
3. Los casos de uso son objetos **sin estado** que reciben sus dependencias por constructor; pueden instanciarse una vez, pero no guardan nada entre llamadas.
4. Regla de lint: `no-restricted-imports` impide importar `infrastructure/db/pool` fuera de `infrastructure/db/**` y de `composition/**`.

## Consecuencias

- (+) Tests sustituyen cualquier dependencia sin *monkey patching*.
- (+) Imposible reutilizar por error el contexto RLS de otra petición.
- (−) La composition root crece; se organiza por módulo (`composition/modules/*.ts`).
