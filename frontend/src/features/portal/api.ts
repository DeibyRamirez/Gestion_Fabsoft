import type {
  PortalMe,
  PortalPeriod,
  PortalRenewalRequest,
  PortalRenewalRequestPage,
  PortalSubscription,
  PortalSubscriptionPage,
  RenewalRequestCreateInput,
} from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';

export const portalApi = {
  me: (token: string | null) => apiFetch<PortalMe>('/portal/me', { token }),

  subscriptions: (token: string | null, status = '') => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (status) params.set('status', status);
    return apiFetch<PortalSubscriptionPage>(`/portal/subscriptions?${params.toString()}`, { token });
  },

  subscription: (token: string | null, id: string) =>
    apiFetch<PortalSubscription>(`/portal/subscriptions/${id}`, { token }),

  periods: (token: string | null, id: string) =>
    apiFetch<{ data: PortalPeriod[] }>(`/portal/subscriptions/${id}/periods`, { token }),

  renewalRequests: (token: string | null, subscriptionId = '') => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (subscriptionId) params.set('subscriptionId', subscriptionId);
    return apiFetch<PortalRenewalRequestPage>(
      `/portal/renewal-requests?${params.toString()}`,
      { token },
    );
  },

  renewalRequest: (token: string | null, id: string) =>
    apiFetch<PortalRenewalRequest>(`/portal/renewal-requests/${id}`, { token }),

  createRenewalRequest: (
    token: string | null,
    input: RenewalRequestCreateInput,
  ): Promise<PortalRenewalRequest> => {
    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    return apiFetch<PortalRenewalRequest>('/portal/renewal-requests', {
      method: 'POST',
      token,
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(input),
    });
  },
};
