import type { TaskCreateInput } from '@fabsoft/shared';
import type { GetClientQuery } from '../../clients/get-client/ports.js';
import type { GetSubscriptionQuery } from '../../subscriptions/get-subscription/ports.js';
import type { GetUserQuery } from '../../users/get-user/ports.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { taskAuditSnapshot } from '../shared/task-audit.js';
import type { TaskView } from '../shared/task-view.js';
import type { CreateTaskRepos } from './ports.js';

type CreateTaskUow = CreateTaskRepos & {
  clientDetail: GetClientQuery;
  subscriptionDetail: GetSubscriptionQuery;
  userDetail: GetUserQuery;
  audit: AuditWriter;
};

export class CreateTask {
  constructor(private readonly uow: UnitOfWork<CreateTaskUow>) {}

  async execute(actor: UserActor, input: TaskCreateInput): Promise<TaskView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(
      actor,
      async ({ taskCreate, clientDetail, subscriptionDetail, userDetail, audit }) => {
        const client = await clientDetail.findById(input.clientId);
        if (!client) throw new ApplicationError('validation_error', 'Cliente no encontrado');

        if (input.subscriptionId) {
          const subscription = await subscriptionDetail.findById(input.subscriptionId);
          if (!subscription || subscription.clientId !== input.clientId) {
            throw new ApplicationError(
              'validation_error',
              'La suscripción no pertenece al cliente indicado',
            );
          }
        }
        if (input.assigneeUserId) {
          const assignee = await userDetail.findById(input.assigneeUserId);
          if (!assignee || assignee.status !== 'active' || assignee.role === 'client') {
            throw new ApplicationError('validation_error', 'El responsable no es válido');
          }
        }

        const created = await taskCreate.insert({
          taskType: input.taskType,
          title: input.title,
          clientId: input.clientId,
          subscriptionId: input.subscriptionId ?? null,
          assigneeUserId: input.assigneeUserId ?? null,
          priority: input.priority ?? 'medium',
          dueDate: input.dueDate,
          notes: input.notes ?? null,
          nextAction: input.nextAction ?? null,
          createdBy: actor.userId,
        });

        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'task.created',
          resourceType: 'task',
          resourceId: created.id,
          changes: { after: taskAuditSnapshot(created) },
          requestId: actor.requestId,
        });
        return created;
      },
    );
  }
}
