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

export const ALERT_EMAIL_TEMPLATE_PLACEHOLDERS = [
  'recipientName',
  'clientName',
  'productName',
  'periodEnd',
  'ruleCode',
  'subscriptionUrl',
  'frontendUrl',
] as const;

export type AlertEmailTemplatePlaceholder = (typeof ALERT_EMAIL_TEMPLATE_PLACEHOLDERS)[number];

export const DEFAULT_ALERT_EMAIL_TEMPLATE = {
  subject: 'Recordatorio de renovación — {{clientName}}',
  body:
    'Hola {{recipientName}},\n\n' +
    'La suscripción de {{clientName}} a {{productName}} vence el {{periodEnd}}.\n' +
    'Alerta: {{ruleCode}}.\n\n' +
    'Revisa la suscripción en {{subscriptionUrl}}\n',
} as const;

const TEMPLATE_PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

export const AlertEmailTemplateSchema = z
  .object({
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(10).max(5000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed = new Set<string>(ALERT_EMAIL_TEMPLATE_PLACEHOLDERS);
    const invalid = [...`${value.subject}\n${value.body}`.matchAll(TEMPLATE_PLACEHOLDER)]
      .map((match) => match[1] ?? '')
      .filter((placeholder) => !allowed.has(placeholder));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: `Placeholders no permitidos: ${[...new Set(invalid)].join(', ')}`,
      });
    }
  });
export type AlertEmailTemplate = z.infer<typeof AlertEmailTemplateSchema>;
