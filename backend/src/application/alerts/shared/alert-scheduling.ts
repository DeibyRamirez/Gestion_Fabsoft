import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

export type AlertCancelReason =
  'renewed' | 'period_end_changed' | 'not_renewed' | 'not_renewable' | 'subscription_cancelled';

export interface AlertReconcileResult {
  scannedSubscriptions: number;
  scheduled: number;
  cancelled: number;
}

/** Programación/cancelación de alertas en la misma transacción del caso de uso (RN-08/RN-09). */
export interface AlertScheduling {
  /** Inserta las notificaciones faltantes cuya fecha programada sea >= hoy. */
  scheduleForPeriod(subscriptionId: string, today: LocalDate): Promise<number>;
  /** Cancela pendientes del periodo anterior (renovación o corrección de fecha). */
  cancelPendingForPeriod(
    subscriptionId: string,
    periodEnd: LocalDate,
    reason: Extract<AlertCancelReason, 'renewed' | 'period_end_changed'>,
  ): Promise<number>;
  /** Cancela pendientes de reglas sin excepción (RN-10). */
  cancelPendingWithoutException(
    subscriptionId: string,
    reason: Extract<AlertCancelReason, 'not_renewed' | 'not_renewable'>,
  ): Promise<number>;
  /** Cancelación terminal de la suscripción. */
  cancelAllPending(
    subscriptionId: string,
    reason: Extract<AlertCancelReason, 'subscription_cancelled'>,
  ): Promise<number>;
  /** Reconciliación diaria: cancela obsoletas y programa faltantes. */
  reconcile(today: LocalDate): Promise<AlertReconcileResult>;
}

export interface AlertSchedulingRepos {
  alerts: AlertScheduling;
}
