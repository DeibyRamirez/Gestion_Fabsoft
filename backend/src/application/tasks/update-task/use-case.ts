import type { TaskUpdateInput } from '@fabsoft/shared';
import { assertTaskOpen } from '../../../domain/tasks/task.js';
import type { GetUserQuery } from '../../users/get-user/ports.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { taskAuditSnapshot } from '../shared/task-audit.js';
import type { TaskView } from '../shared/task-view.js';
import type { UpdateTaskRepos } from './ports.js';

type UpdateTaskUow = UpdateTaskRepos & { userDetail: GetUserQuery; audit: AuditWriter };

export class UpdateTask {
  constructor(private readonly uow: UnitOfWork<UpdateTaskUow>) {}

  async execute(actor: UserActor, id: string, input: TaskUpdateInput): Promise<TaskView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ taskUpdate, userDetail, audit }) => {
      const current = await taskUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Tarea no encontrada');
      if (current.version !== input.version) {
        throw new ApplicationError('version_conflict', 'La tarea fue modificada');
      }
      assertTaskOpen(current.status);
      if (input.assigneeUserId) {
        const assignee = await userDetail.findById(input.assigneeUserId);
        if (!assignee || assignee.status !== 'activo' || assignee.role === 'client') {
          throw new ApplicationError('validation_error', 'El responsable no es válido');
        }
      }

      const updated = await taskUpdate.save(
        id,
        current.version,
        {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
        },
        actor.userId,
      );
      if (!updated) throw new ApplicationError('version_conflict', 'La tarea fue modificada');

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'task.updated',
        resourceType: 'task',
        resourceId: id,
        changes: {
          before: taskAuditSnapshot(current),
          after: taskAuditSnapshot(updated),
        },
        requestId: actor.requestId,
      });
      return updated;
    });
  }
}
