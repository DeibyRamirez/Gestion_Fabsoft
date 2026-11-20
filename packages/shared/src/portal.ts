import { z } from 'zod';
import { MeSchema } from './auth.js';
import {
  BillingCycleSchema,
  RenewalOutcomeSchema,
  RenewalRequestResolutionSchema,
  RenewalRequestStatusSchema,
  SubscriptionStatusSchema,
} from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.string().regex(/^\d{1,12}\.\d{2}$/, 'Importe inválido: usa formato 1234.56');
const currency = z.literal('COP');

export const PortalContactChannelSchema = z.object({
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  hours: z.string().nullable(),
});
export type PortalContactChannel = z.infer<typeof PortalContactChannelSchema>;

export const PortalOrganizationSchema = z.object({
  id: z.string().uuid(),
  legalName: z.string(),
  taxId: z.string().nullable(),
});
export type PortalOrganization = z.infer<typeof PortalOrganizationSchema>;

export const PortalMeSchema = z.object({
  user: MeSchema,
  organization: PortalOrganizationSchema,
  contactChannel: PortalContactChannelSchema,
});
export type PortalMe = z.infer<typeof PortalMeSchema>;

export const PortalSubscriptionSchema = z.object({
  id: z.string().uuid(),
  productName: z.string(),
  contractReference: z.string().nullable(),
  startDate: isoDate,
  currentPeriodEnd: isoDate,
  daysUntilExpiration: z.number().int(),
  billingCycle: BillingCycleSchema,
  priceAmount: amount,
  currency,
  status: SubscriptionStatusSchema,
  renewalTerms: z.string().nullable(),
  hasOpenRenewalRequest: z.boolean(),
});
export type PortalSubscription = z.infer<typeof PortalSubscriptionSchema>;

export const PortalSubscriptionPageSchema = z.object({
  data: z.array(PortalSubscriptionSchema),
  meta: PaginationMetaSchema,
});
export type PortalSubscriptionPage = z.infer<typeof PortalSubscriptionPageSchema>;

export const PortalPeriodSchema = z.object({
  periodNumber: z.number().int().min(1),
  startDate: isoDate,
  endDate: isoDate,
  billingCycle: BillingCycleSchema,
  priceAmount: amount,
  currency,
  renewalOutcome: RenewalOutcomeSchema,
});
export type PortalPeriod = z.infer<typeof PortalPeriodSchema>;

export const PortalRenewalRequestSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  productName: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  status: RenewalRequestStatusSchema,
  resolution: RenewalRequestResolutionSchema.nullable().optional(),
  resolutionNote: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().optional(),
});
export type PortalRenewalRequest = z.infer<typeof PortalRenewalRequestSchema>;

export const PortalRenewalRequestPageSchema = z.object({
  data: z.array(PortalRenewalRequestSchema),
  meta: PaginationMetaSchema,
});
export type PortalRenewalRequestPage = z.infer<typeof PortalRenewalRequestPageSchema>;

const csvSubscriptionStatus = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(SubscriptionStatusSchema));

export const PortalSubscriptionListQuerySchema = PageQuerySchema.extend({
  status: csvSubscriptionStatus.optional(),
});
export type PortalSubscriptionListQuery = z.infer<typeof PortalSubscriptionListQuerySchema>;

export const PortalRenewalRequestListQuerySchema = PageQuerySchema.extend({
  subscriptionId: z.string().uuid().optional(),
});
export type PortalRenewalRequestListQuery = z.infer<typeof PortalRenewalRequestListQuerySchema>;
