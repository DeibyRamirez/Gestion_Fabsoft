'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { SubscriptionPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { SubscriptionsTable } from './subscriptions-table';

export function SubscriptionsPage() {
  const { token } = useAuth();
  const [page, setPage] = useState<SubscriptionPage | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    apiFetch<SubscriptionPage>('/subscriptions?pageSize=50', { token })
      .then((p) => {
        if (alive) setPage(p);
      })
      .catch(() => {
        if (alive) setPage(null);
      });
    return () => {
      alive = false;
    };
  }, [token, version]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Suscripciones"
        description="Vigencia de las suscripciones de los clientes."
        actions={
          <Button asChild>
            <Link href="/subscriptions/new">Nueva suscripción</Link>
          </Button>
        }
      />
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={reload}>
          Actualizar
        </Button>
      </div>
      {page ? (
        <Card>
          <CardContent className="pt-6">
            <SubscriptionsTable page={page} />
          </CardContent>
        </Card>
      ) : (
        <p>Cargando suscripciones…</p>
      )}
    </div>
  );
}
