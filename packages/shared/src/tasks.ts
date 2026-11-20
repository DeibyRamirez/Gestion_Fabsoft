import { z } from 'zod';
import { TaskPrioritySchema, TaskStatusSchema, TaskTypeSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';
import { UserRefSchema } from './users.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TaskOriginSchema = z.enum(['manual', 'alert_rule', 'renewal_request']);
export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  taskType: TaskTypeSchema,
  title: z.string(),
  clientId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable(),
  renewalRequestId: z.string().uuid().nullable(),
  assignee: UserRefSchema.nullable(),
  priority: TaskPrioritySchema,
  dueDate: isoDate,
  isOverdue: z.boolean(),
  status: TaskStatusSchema,
  notes: z.string().nullable(),
  nextAction: z.string().nullable(),
  outcome: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  origin: TaskOriginSchema,
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskDto = z.infer<typeof TaskSchema>;

export const TaskCreateSchema = z
  .object({
    taskType: TaskTypeSchema,
    title: z.string().trim().min(2).max(200),
    clientId: z.string().uuid(),
    subscriptionId: z.string().uuid().nullable().optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    priority: TaskPrioritySchema.optional(),
    dueDate: isoDate,
    notes: z.string().trim().max(5000).nullable().optional(),
    nextAction: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

export const TaskUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    title: z.string().trim().min(2).max(200).optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    priority: TaskPrioritySchema.optional(),
    dueDate: isoDate.optional(),
    status: z.enum(['pendiente', 'en_progreso']).optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    nextAction: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, {
    message: 'Se requiere al menos un campo además de version',
  });
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

export const TaskCloseSchema = z
  .object({
    version: z.number().int().min(1),
    outcome: z.string().trim().min(2).max(2000),
  })
  .strict();
export type TaskCloseInput = z.infer<typeof TaskCloseSchema>;

const csvTaskStatus = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(TaskStatusSchema));

const csvTaskPriority = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(TaskPrioritySchema));

const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const TaskListQuerySchema = PageQuerySchema.extend({
  assigneeUserId: z.union([z.string().uuid(), z.literal('me')]).optional(),
  status: csvTaskStatus.optional(),
  priority: csvTaskPriority.optional(),
  taskType: TaskTypeSchema.optional(),
  clientId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  overdue: booleanQuery.optional(),
  sort: z
    .enum(['dueDate', '-dueDate', 'priority', '-priority', 'createdAt', '-createdAt'])
    .default('dueDate'),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

export const TaskPageSchema = z.object({
  data: z.array(TaskSchema),
  meta: PaginationMetaSchema,
});
export type TaskPage = z.infer<typeof TaskPageSchema>;
