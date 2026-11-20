import type { TaskListQuery } from '@fabsoft/shared';
import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import { compareLocalDate } from '../../../domain/subscriptions/local-date.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { Clock, UnitOfWork } from '../../shared/ports.js';
import type { TaskView } from '../shared/task-view.js';
import type { ListTasksRepos } from './ports.js';

export interface TaskListResult {
  items: TaskView[];
  page: number;
  pageSize: number;
  total: number;
}

export class ListTasks {
  constructor(
    private readonly uow: UnitOfWork<ListTasksRepos>,
    private readonly clock: Clock,
  ) {}

  async execute(actor: UserActor, query: TaskListQuery): Promise<TaskListResult> {
    requireRole(actor, 'admin', 'operator');
    if (query.dueFrom && query.dueTo && compareLocalDate(query.dueFrom, query.dueTo) > 0) {
      throw new ApplicationError('validation_error', 'dueFrom no puede ser posterior a dueTo');
    }
    const assigneeUserId = query.assigneeUserId === 'me' ? actor.userId : query.assigneeUserId;
    const { items, total } = await this.uow.run(actor, ({ tasksList }) =>
      tasksList.list({
        ...query,
        ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
        today: toBogotaLocalDate(this.clock.now()),
      }),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
