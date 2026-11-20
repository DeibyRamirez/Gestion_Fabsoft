import { z } from 'zod';
import { NotificationChannelSchema, TaskPrioritySchema, TaskTypeSchema } from './enums.js';

export const AlertRuleSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  description: z.string(),
  offsetDays: z.number().int().min(-90).max(365),
  channels: z.array(NotificationChannelSchema).min(1),
  createsTask: z.boolean(),
  taskType: TaskTypeSchema.nullable(),
  taskPriority: TaskPrioritySchema.nullable(),
  appliesWhenNotRenewable: z.boolean(),
  isActive: z.boolean(),
});
export type AlertRuleDto = z.infer<typeof AlertRuleSchema>;

export const AlertRuleUpdateSchema = z
  .object({
    description: z.string().trim().min(3).max(200).optional(),
    offsetDays: z.number().int().min(-90).max(365).optional(),
    channels: z
      .array(NotificationChannelSchema)
      .min(1)
      .refine((channels) => new Set(channels).size === channels.length, {
        message: 'Los canales no pueden repetirse',
      })
      .optional(),
    createsTask: z.boolean().optional(),
    taskType: TaskTypeSchema.nullable().optional(),
    taskPriority: TaskPrioritySchema.nullable().optional(),
    appliesWhenNotRenewable: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Se requiere al menos un campo' });
export type AlertRuleUpdateInput = z.infer<typeof AlertRuleUpdateSchema>;

export const AlertRuleListSchema = z.object({
  data: z.array(AlertRuleSchema),
});
export type AlertRuleList = z.infer<typeof AlertRuleListSchema>;
