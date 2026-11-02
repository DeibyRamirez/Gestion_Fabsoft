# ADR-003 — Wompi (pagos en línea) fuera del MVP

- **Estado:** Aceptada
- **Fecha:** 2026-11-01

## Contexto

Se propuso integrar la pasarela **Wompi**. El documento funcional (§3) excluye explícitamente del alcance inicial el procesamiento de pagos en línea, la facturación electrónica y la contabilidad. El contexto técnico (§3, §4, advertencia 4) lo marca como "❌ Fuera del MVP — Etapa 5, si se necesita". La pregunta funcional pendiente nº 1 (¿se registran pagos y cartera?) sigue abierta.

## Decisión

1. **No** se integra Wompi ni ninguna otra pasarela en el MVP. No hay SDK, webhooks, claves ni tablas de transacciones.
2. El MVP sólo registra la **dimensión de pago** de forma manual y por periodo: `subscription_periods.payment_status` ∈ `not_tracked | pending | received`, modificable por admin/operador mediante `PATCH /api/v1/subscriptions/{id}/periods/{periodId}`. Nunca se infiere de la fecha de vencimiento (RN-06, RN-07).
3. Una renovación confirmada crea el nuevo periodo con `payment_status='pending'` (o `not_tracked` si el operador lo indica), jamás `received` automáticamente.
4. Si en el futuro se aprueba (Etapa 5): tabla `payments` **separada** de `subscriptions` y `subscription_periods` (FK a `subscription_period_id`), adaptador `PaymentGateway` en `infrastructure/payments/wompi`, webhooks firmados con idempotencia, y un ADR nuevo que reemplace este.

## Consecuencias

- (+) Se evita alcance, superficie de ataque (PCI, webhooks) y complejidad no pedida.
- (+) El diseño ya separa vigencia/pago/seguimiento, por lo que añadir pagos no exige rediseñar suscripciones.
- (−) La conciliación de pagos queda manual mientras no se apruebe la Etapa 5.
