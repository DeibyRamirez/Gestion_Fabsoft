'use client';

import { useRouter } from 'next/navigation';
import { SubscriptionForm } from '@/features/subscriptions/subscription-form';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Card, CardContent } from '@/shared/ui/card';

export default function NewSubscriptionRoute() {
  const { token } = useAuth();
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        breadcrumbs={['Gestión', 'Suscripciones', 'Nueva']}
        title="Nueva suscripción"
        description="Sólo se muestran clientes activos y productos activos."
      />
      <Card>
        <CardContent className="pt-6">
          <SubscriptionForm
            token={token}
            onCreated={(s) => router.push(`/subscriptions/${s.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
