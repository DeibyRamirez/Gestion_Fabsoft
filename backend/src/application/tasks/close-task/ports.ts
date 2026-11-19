import type { TaskStatus } from '@fabsoft/shared';
import type { TaskView } from '../shared/task-view.js';

export interface CloseTaskRepository {
  loadForUpdate(id: string): Promise<TaskView | null>;
  close(
    id: string,
    expectedVersion: number,
    status: Extract<TaskStatus, 'completed' | 'cancelled'>,
    outcome: string,
    closedAt: Date,
    updatedBy: string,
  ): Promise<TaskView | null>;
}

export interface CloseTaskRepos {
  taskClose: CloseTaskRepository;
}
