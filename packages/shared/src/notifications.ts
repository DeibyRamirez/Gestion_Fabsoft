import { z } from 'zod';
import {
  NotificationChannelSchema,
  NotificationStatusSchema,
  NotificationTypeSchema,
} from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';
import { UserRefSchema } from './users.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  notificationType: NotificationTypeSchema,
  subscriptionId: z.string().uuid().nullable(),
  renewalRequestId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  ruleCode: z.string().nullable(),
  periodEnd: isoDate.nullable(),
  channel: NotificationChannelSchema,
  recipient: UserRefSchema,
  scheduledFor: z.string().datetime(),
  status: NotificationStatusSchema,
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(10),
  nextAttemptAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  readAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  title: z.string(),
});
export type NotificationDto = z.infer<typeof NotificationSchema>;

const csvNotificationStatus = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(NotificationStatusSchema));

const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const NotificationListQuerySchema = PageQuerySchema.extend({
  mine: booleanQuery.default(false),
  unread: booleanQuery.optional(),
  status: csvNotificationStatus.optional(),
  channel: NotificationChannelSchema.optional(),
  subscriptionId: z.string().uuid().optional(),
  sort: z.enum(['scheduledFor', '-scheduledFor']).default('-scheduledFor'),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const NotificationPageSchema = z.object({
  data: z.array(NotificationSchema),
  meta: PaginationMetaSchema.extend({ unreadCount: z.number().int().min(0).optional() }),
});
export type NotificationPage = z.infer<typeof NotificationPageSchema>;
