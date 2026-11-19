import type { TaskListQuery } from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';
import type { TaskView } from '../shared/task-view.js';

export interface ResolvedTaskListQuery extends TaskListQuery {
  today: LocalDate;
}

export interface ListTasksQuery {
  list(query: ResolvedTaskListQuery): Promise<{ items: TaskView[]; total: number }>;
}

export interface ListTasksRepos {
  tasksList: ListTasksQuery;
}
