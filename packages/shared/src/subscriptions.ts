import { z } from 'zod';
import {
  BillingCycleSchema,
  FollowUpStatusSchema,
  PaymentStatusSchema,
  RenewalOutcomeSchema,
  SubscriptionStatusSchema,
} from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.string().regex(/^\d{1,12}\.\d{2}$/, 'Importe inválido: usa formato 1234.56');
const currency = z.literal('COP');

export const SubscriptionClientRefSchema = z.object({
  id: z.string().uuid(),
  legalName: z.string(),
});
export type SubscriptionClientRef = z.infer<typeof SubscriptionClientRefSchema>;

export const SubscriptionProductRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type SubscriptionProductRef = z.infer<typeof SubscriptionProductRefSchema>;

export const SubscriptionOwnerRefSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
});
export type SubscriptionOwnerRef = z.infer<typeof SubscriptionOwnerRefSchema>;

export const SubscriptionPeriodSchema = z.object({
  id: z.string().uuid(),
  periodNumber: z.number().int().min(1),
  startDate: isoDate,
  endDate: isoDate,
  billingCycle: BillingCycleSchema,
  priceAmount: amount,
  currency,
  renewalOutcome: RenewalOutcomeSchema,
  outcomeReason: z.string().nullable(),
  paymentStatus: PaymentStatusSchema,
  confirmedAt: z.string().datetime().nullable(),
  confirmedBy: SubscriptionOwnerRefSchema.nullable(),
  contractReference: z.string().nullable(),
});
export type SubscriptionPeriodDto = z.infer<typeof SubscriptionPeriodSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  client: SubscriptionClientRefSchema,
  product: SubscriptionProductRefSchema,
  contractReference: z.string().nullable(),
  startDate: isoDate,
  currentPeriodEnd: isoDate,
  daysUntilExpiration: z.number().int(),
  billingCycle: BillingCycleSchema,
  customCycleMonths: z.number().int().nullable(),
  priceAmount: amount,
  currency,
  status: SubscriptionStatusSchema,
  followUpStatus: FollowUpStatusSchema,
  currentPaymentStatus: PaymentStatusSchema.nullable(),
  isRenewable: z.boolean(),
  owner: SubscriptionOwnerRefSchema.nullable(),
  version: z.number().int().min(1),
});
export type SubscriptionDto = z.infer<typeof SubscriptionSchema>;

export const SubscriptionDetailSchema = SubscriptionSchema.extend({
  supplierCostAmount: amount.nullable(),
  renewalTerms: z.string().nullable(),
  visibleInPortal: z.boolean(),
  notes: z.string().nullable(),
  currentPeriod: SubscriptionPeriodSchema.nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SubscriptionDetailDto = z.infer<typeof SubscriptionDetailSchema>;

/** `currentPeriodEnd` es opcional: si falta se calcula con `billingCycle` (HU-06). */
export const SubscriptionCreateSchema = z
  .object({
    clientId: z.string().uuid(),
    productId: z.string().uuid(),
    contractReference: z.string().trim().max(120).nullable().optional(),
    startDate: isoDate,
    currentPeriodEnd: isoDate.optional(),
    billingCycle: BillingCycleSchema,
    customCycleMonths: z.number().int().min(1).max(120).nullable().optional(),
    priceAmount: amount,
    currency: currency.optional(),
    supplierCostAmount: amount.nullable().optional(),
    renewalTerms: z.string().trim().max(2000).nullable().optional(),
    isRenewable: z.boolean().optional(),
    visibleInPortal: z.boolean().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    initialPaymentStatus: PaymentStatusSchema.optional(),
  })
  .strict();
export type SubscriptionCreateInput = z.infer<typeof SubscriptionCreateSchema>;

export const SubscriptionUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    contractReference: z.string().trim().max(120).nullable().optional(),
    renewalTerms: z.string().trim().max(2000).nullable().optional(),
    isRenewable: z.boolean().optional(),
    visibleInPortal: z.boolean().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    followUpStatus: z.enum(['en_gestion', 'esperando_cliente']).optional(),
    priceAmount: amount.optional(),
    supplierCostAmount: amount.nullable().optional(),
    changeReason: z.string().trim().min(3).max(1000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, {
    message: 'Se requiere al menos un campo además de version',
  });
export type SubscriptionUpdateInput = z.infer<typeof SubscriptionUpdateSchema>;

export const SubscriptionVersionSchema = z.object({ version: z.number().int().min(1) }).strict();
export type SubscriptionVersionInput = z.infer<typeof SubscriptionVersionSchema>;

export const SubscriptionCancelSchema = z
  .object({
    version: z.number().int().min(1),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export type SubscriptionCancelInput = z.infer<typeof SubscriptionCancelSchema>;

const csvSubscriptionStatus = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(SubscriptionStatusSchema));

export const SubscriptionListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  clientId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  status: csvSubscriptionStatus.optional(),
  followUpStatus: FollowUpStatusSchema.optional(),
  expiresFrom: isoDate.optional(),
  expiresTo: isoDate.optional(),
  sort: z
    .enum([
      'currentPeriodEnd',
      '-currentPeriodEnd',
      'createdAt',
      '-createdAt',
      'clientName',
      '-clientName',
    ])
    .default('currentPeriodEnd'),
}).refine(
  (query) => !query.expiresFrom || !query.expiresTo || query.expiresFrom <= query.expiresTo,
  { message: 'expiresFrom no puede ser posterior a expiresTo', path: ['expiresTo'] },
);
export type SubscriptionListQuery = z.infer<typeof SubscriptionListQuerySchema>;

export const SubscriptionPageSchema = z.object({
  data: z.array(SubscriptionSchema),
  meta: PaginationMetaSchema,
});
export type SubscriptionPage = z.infer<typeof SubscriptionPageSchema>;

export const RenewInputSchema = z
  .object({
    version: z.number().int().min(1),
    newPeriod: z
      .object({
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
        billingCycle: BillingCycleSchema.optional(),
        customCycleMonths: z.number().int().min(1).max(120).nullable().optional(),
        priceAmount: amount,
        supplierCostAmount: amount.nullable().optional(),
        contractReference: z.string().trim().max(120).nullable().optional(),
        paymentStatus: z.enum(['pendiente', 'sin_seguimiento']).optional(),
      })
      .strict(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export type RenewInput = z.infer<typeof RenewInputSchema>;

export const SubscriptionNotRenewedSchema = z
  .object({
    version: z.number().int().min(1),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export type SubscriptionNotRenewedInput = z.infer<typeof SubscriptionNotRenewedSchema>;

export const CorrectExpirationInputSchema = z
  .object({
    version: z.number().int().min(1),
    newCurrentPeriodEnd: isoDate,
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export type CorrectExpirationInput = z.infer<typeof CorrectExpirationInputSchema>;

export const PeriodPaymentUpdateSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.optional(),
    contractReference: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Se requiere al menos un campo',
  });
export type PeriodPaymentUpdateInput = z.infer<typeof PeriodPaymentUpdateSchema>;

export const SubscriptionPeriodListSchema = z.object({
  data: z.array(SubscriptionPeriodSchema),
});
export type SubscriptionPeriodList = z.infer<typeof SubscriptionPeriodListSchema>;
