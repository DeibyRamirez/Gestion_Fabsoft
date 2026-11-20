import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { TaskView } from '../shared/task-view.js';
import type { GetTaskRepos } from './ports.js';

export class GetTask {
  constructor(private readonly uow: UnitOfWork<GetTaskRepos>) {}

  async execute(actor: UserActor, id: string): Promise<TaskView> {
    requireRole(actor, 'admin', 'operator');
    const task = await this.uow.run(actor, ({ taskDetail }) => taskDetail.findById(id));
    if (!task) throw new ApplicationError('not_found', 'Tarea no encontrada');
    return task;
  }
}
