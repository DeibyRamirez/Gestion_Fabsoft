import type { TaskView } from '../shared/task-view.js';

export interface GetTaskQuery {
  findById(id: string): Promise<TaskView | null>;
}

export interface GetTaskRepos {
  taskDetail: GetTaskQuery;
}
