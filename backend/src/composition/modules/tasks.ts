import { CancelTask } from '../../application/tasks/cancel-task/use-case.js';
import { CompleteTask } from '../../application/tasks/complete-task/use-case.js';
import { CreateTask } from '../../application/tasks/create-task/use-case.js';
import { GetTask } from '../../application/tasks/get-task/use-case.js';
import { ListTasks } from '../../application/tasks/list-tasks/use-case.js';
import { UpdateTask } from '../../application/tasks/update-task/use-case.js';
import type { Infra } from '../infra.js';

export function tasksModule(infra: Infra) {
  return {
    listTasks: new ListTasks(infra.userUow, infra.clock),
    getTask: new GetTask(infra.userUow),
    createTask: new CreateTask(infra.userUow),
    updateTask: new UpdateTask(infra.userUow),
    completeTask: new CompleteTask(infra.userUow, infra.clock),
    cancelTask: new CancelTask(infra.userUow, infra.clock),
  };
}
