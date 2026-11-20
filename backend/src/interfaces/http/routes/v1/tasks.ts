import {
  TaskCloseSchema,
  TaskCreateSchema,
  TaskListQuerySchema,
  TaskUpdateSchema,
  type TaskDto,
} from '@fabsoft/shared';
import { API_VERSION_PREFIX } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { CancelTask } from '../../../../application/tasks/cancel-task/use-case.js';
import type { CompleteTask } from '../../../../application/tasks/complete-task/use-case.js';
import type { CreateTask } from '../../../../application/tasks/create-task/use-case.js';
import type { GetTask } from '../../../../application/tasks/get-task/use-case.js';
import type { ListTasks } from '../../../../application/tasks/list-tasks/use-case.js';
import type { TaskView } from '../../../../application/tasks/shared/task-view.js';
import type { UpdateTask } from '../../../../application/tasks/update-task/use-case.js';
import { toBogotaLocalDate } from '../../../../domain/subscriptions/bogota-date.js';
import { isTaskOverdue } from '../../../../domain/tasks/task.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface TasksRouteDeps {
  listTasks: ListTasks;
  getTask: GetTask;
  createTask: CreateTask;
  updateTask: UpdateTask;
  completeTask: CompleteTask;
  cancelTask: CancelTask;
}

const IdSchema = z.string().uuid();

export const toTaskDto = (t: TaskView, today: string): TaskDto => ({
  id: t.id,
  taskType: t.taskType,
  title: t.title,
  clientId: t.clientId,
  subscriptionId: t.subscriptionId,
  renewalRequestId: t.renewalRequestId,
  assignee: t.assignee,
  priority: t.priority,
  dueDate: t.dueDate,
  isOverdue: isTaskOverdue(t.dueDate, t.status, today),
  status: t.status,
  notes: t.notes,
  nextAction: t.nextAction,
  outcome: t.outcome,
  completedAt: t.completedAt?.toISOString() ?? null,
  origin: t.origin,
  version: t.version,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

/** /renewal-tasks: tareas internas de admin/operator. */
export function tasksRouter(
  deps: TasksRouteDeps,
  guards: RequestHandler[],
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  const staff = [...guards, requireRole('admin', 'operator')];

  router.get('/renewal-tasks', ...staff, async (req, res) => {
    const query = TaskListQuerySchema.parse(req.query);
    const result = await deps.listTasks.execute(actorOf(res), query);
    const today = toBogotaLocalDate(new Date());
    res.json({
      data: result.items.map((t) => toTaskDto(t, today)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    });
  });

  router.post('/renewal-tasks', ...staff, createIdempotency, async (req, res) => {
    const input = TaskCreateSchema.parse(req.body);
    const created = await deps.createTask.execute(actorOf(res), input);
    res.setHeader('Location', `${API_VERSION_PREFIX}/renewal-tasks/${created.id}`);
    res.status(201).json(toTaskDto(created, toBogotaLocalDate(new Date())));
  });

  router.get('/renewal-tasks/:id', ...staff, async (req, res) => {
    const task = await deps.getTask.execute(actorOf(res), IdSchema.parse(req.params.id));
    res.json(toTaskDto(task, toBogotaLocalDate(new Date())));
  });

  router.patch('/renewal-tasks/:id', ...staff, async (req, res) => {
    const input = TaskUpdateSchema.parse(req.body);
    const task = await deps.updateTask.execute(actorOf(res), IdSchema.parse(req.params.id), input);
    res.json(toTaskDto(task, toBogotaLocalDate(new Date())));
  });

  router.post('/renewal-tasks/:id/complete', ...staff, async (req, res) => {
    const input = TaskCloseSchema.parse(req.body);
    const task = await deps.completeTask.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      input,
    );
    res.json(toTaskDto(task, toBogotaLocalDate(new Date())));
  });

  router.post('/renewal-tasks/:id/cancel', ...staff, async (req, res) => {
    const input = TaskCloseSchema.parse(req.body);
    const task = await deps.cancelTask.execute(actorOf(res), IdSchema.parse(req.params.id), input);
    res.json(toTaskDto(task, toBogotaLocalDate(new Date())));
  });

  return router;
}
