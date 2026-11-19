import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

/** Cierre/cancelación de tareas automáticas dentro de la transacción (RN-09). */
export interface TaskAutomation {
  /** Renovación confirmada: completa las abiertas del periodo anterior. */
  completeAutoTasksForSubscription(
    subscriptionId: string,
    outcome: string,
    updatedBy: string,
  ): Promise<number>;
  /** Corrección de vencimiento: cancela las `pending` del periodo antiguo. */
  cancelPendingAutoTasksForPeriod(
    subscriptionId: string,
    periodEnd: LocalDate,
    outcome: string,
    updatedBy: string,
  ): Promise<number>;
  /** Corrección de vencimiento: conserva las `in_progress` añadiendo una nota. */
  annotateInProgressAutoTasksForPeriod(
    subscriptionId: string,
    periodEnd: LocalDate,
    note: string,
    updatedBy: string,
  ): Promise<number>;
  /** No renovación: cierra las tareas automáticas de renovación. */
  cancelOpenAutoTasksForSubscription(
    subscriptionId: string,
    outcome: string,
    updatedBy: string,
  ): Promise<number>;
  /** Cancelación terminal: cancela todas las tareas abiertas de la suscripción. */
  cancelOpenTasksForSubscription(
    subscriptionId: string,
    outcome: string,
    updatedBy: string,
  ): Promise<number>;
}

export interface TaskAutomationRepos {
  tasksAutomation: TaskAutomation;
}
