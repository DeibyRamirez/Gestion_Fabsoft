import type { SubscriptionView } from './subscription-view.js';

export const subscriptionAuditSnapshot = (s: SubscriptionView) => ({
  clientId: s.clientId,
  productId: s.productId,
  startDate: s.startDate,
  currentPeriodEnd: s.currentPeriodEnd,
  billingCycle: s.billingCycle,
  customCycleMonths: s.customCycleMonths,
  priceAmount: s.priceAmount,
  currency: s.currency,
  supplierCostAmount: s.supplierCostAmount,
  isRenewable: s.isRenewable,
  status: s.status,
  followUpStatus: s.followUpStatus,
  visibleInPortal: s.visibleInPortal,
  ownerUserId: s.ownerUserId,
  notes: s.notes,
  version: s.version,
});
