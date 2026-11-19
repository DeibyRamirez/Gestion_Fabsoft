import type { TaskPriority } from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';
import type { TaskView } from '../shared/task-view.js';

export interface TaskPatch {
  title?: string;
  assigneeUserId?: string | null;
  priority?: TaskPriority;
  dueDate?: LocalDate;
  status?: 'pending' | 'in_progress';
  notes?: string | null;
  nextAction?: string | null;
}

export interface UpdateTaskRepository {
  loadForUpdate(id: string): Promise<TaskView | null>;
  save(
    id: string,
    expectedVersion: number,
    patch: TaskPatch,
    updatedBy: string,
  ): Promise<TaskView | null>;
}

export interface UpdateTaskRepos {
  taskUpdate: UpdateTaskRepository;
}
