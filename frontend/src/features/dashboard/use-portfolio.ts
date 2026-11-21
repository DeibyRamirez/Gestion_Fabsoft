'use client';

import { useEffect, useState } from 'react';
import type { SubscriptionDto, SubscriptionPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';

async function fetchAllSubscriptions(token: string | null): Promise<SubscriptionDto[]> {
  const first = await apiFetch<SubscriptionPage>(
    '/subscriptions?pageSize=100&page=1&sort=currentPeriodEnd',
    { token },
  );
  if (first.meta.totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
      apiFetch<SubscriptionPage>(
        `/subscriptions?pageSize=100&page=${index + 2}&sort=currentPeriodEnd`,
        { token },
      ),
    ),
  );

  return [first, ...rest].flatMap((page) => page.data);
}

/** Cartera completa para las gráficas del Panel. Usa el endpoint existente de suscripciones. */
export function usePortfolio(token: string | null) {
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetchAllSubscriptions(token)
      .then((data) => {
        if (!alive) return;
        setSubscriptions(data);
        setError(null);
      })
      .catch(() => {
        if (alive) setError('No se pudieron cargar las gráficas del portafolio.');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  return {
    subscriptions,
    error,
    loading: subscriptions === null && error === null,
  };
}
