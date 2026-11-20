import type { AlertRuleUpdateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { alertRuleSnapshot, type AlertRuleView } from '../shared/alert-rule-view.js';
import type { UpdateAlertRuleRepos } from './ports.js';

type UpdateAlertRuleUow = UpdateAlertRuleRepos & { audit: AuditWriter };

/**
 * Edita la política global de alertas. La reconciliación diaria del worker
 * (00:10 Bogotá) aplica los umbrales nuevos y cancela las alertas obsoletas.
 */
export class UpdateAlertRule {
  constructor(private readonly uow: UnitOfWork<UpdateAlertRuleUow>) {}

  async execute(
    actor: UserActor,
    id: string,
    input: AlertRuleUpdateInput,
  ): Promise<AlertRuleView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ alertRuleUpdate, audit }) => {
      const current = await alertRuleUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Regla de alerta no encontrada');

      const next = mergePolicy(current, input);
      const outcome = await alertRuleUpdate.save(
        id,
        {
          description: next.description,
          offsetDays: next.offsetDays,
          channels: next.channels,
          createsTask: next.createsTask,
          taskType: next.taskType,
          taskPriority: next.taskPriority,
          appliesWhenNotRenewable: next.appliesWhenNotRenewable,
          isActive: next.isActive,
        },
        actor.userId,
      );

      if (!outcome.ok) {
        if (outcome.reason === 'offset_taken') {
          throw new ApplicationError(
            'alert_rule_offset_taken',
            'Ya existe otra regla con ese umbral de días',
          );
        }
        throw new ApplicationError(
          'validation_error',
          'Si la regla crea una tarea, el tipo y la prioridad son obligatorios',
        );
      }

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'alert_rule.updated',
        resourceType: 'alert_rule',
        resourceId: id,
        changes: { before: alertRuleSnapshot(current), after: alertRuleSnapshot(outcome.rule) },
        requestId: actor.requestId,
      });
      return outcome.rule;
    });
  }
}

function mergePolicy(current: AlertRuleView, input: AlertRuleUpdateInput): AlertRuleView {
  const merged: AlertRuleView = {
    ...current,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.offsetDays !== undefined ? { offsetDays: input.offsetDays } : {}),
    ...(input.channels !== undefined ? { channels: input.channels } : {}),
    ...(input.createsTask !== undefined ? { createsTask: input.createsTask } : {}),
    ...(input.taskType !== undefined ? { taskType: input.taskType } : {}),
    ...(input.taskPriority !== undefined ? { taskPriority: input.taskPriority } : {}),
    ...(input.appliesWhenNotRenewable !== undefined
      ? { appliesWhenNotRenewable: input.appliesWhenNotRenewable }
      : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };

  if (!merged.createsTask) return { ...merged, taskType: null, taskPriority: null };
  if (!merged.taskType || !merged.taskPriority) {
    throw new ApplicationError(
      'validation_error',
      'Si la regla crea una tarea, el tipo y la prioridad son obligatorios',
    );
  }
  return merged;
}
