import type { TaskPriority, TaskType } from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';
import type { TaskView } from '../shared/task-view.js';

export interface NewTaskRecord {
  taskType: TaskType;
  title: string;
  clientId: string;
  subscriptionId: string | null;
  assigneeUserId: string | null;
  priority: TaskPriority;
  dueDate: LocalDate;
  notes: string | null;
  nextAction: string | null;
  createdBy: string;
}

export interface CreateTaskRepository {
  insert(record: NewTaskRecord): Promise<TaskView>;
}

export interface CreateTaskRepos {
  taskCreate: CreateTaskRepository;
}
