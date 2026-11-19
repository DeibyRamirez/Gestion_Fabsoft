import type { TaskCloseInput } from '@fabsoft/shared';
import { assertTaskOpen } from '../../../domain/tasks/task.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import type { CloseTaskRepos } from '../close-task/ports.js';
import { taskAuditSnapshot } from '../shared/task-audit.js';
import type { TaskView } from '../shared/task-view.js';

type CancelTaskUow = CloseTaskRepos & { audit: AuditWriter };

export class CancelTask {
  constructor(
    private readonly uow: UnitOfWork<CancelTaskUow>,
    private readonly clock: Clock,
  ) {}

  async execute(actor: UserActor, id: string, input: TaskCloseInput): Promise<TaskView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ taskClose, audit }) => {
      const current = await taskClose.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Tarea no encontrada');
      if (current.version !== input.version) {
        throw new ApplicationError('version_conflict', 'La tarea fue modificada');
      }
      assertTaskOpen(current.status);

      const updated = await taskClose.close(
        id,
        current.version,
        'cancelled',
        input.outcome,
        this.clock.now(),
        actor.userId,
      );
      if (!updated) throw new ApplicationError('version_conflict', 'La tarea fue modificada');

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'task.cancelled',
        resourceType: 'task',
        resourceId: id,
        changes: {
          before: taskAuditSnapshot(current),
          after: taskAuditSnapshot(updated),
        },
        reason: input.outcome,
        requestId: actor.requestId,
      });
      return updated;
    });
  }
}
