'use client';

import { useRouter } from 'next/navigation';
import { SubscriptionForm } from '@/features/subscriptions/subscription-form';
import { useAuth } from '@/features/auth/auth-provider';
import { BentoCard } from '@/shared/components/bento';
import { PageHeader } from '@/shared/components/page-header';

export default function NewSubscriptionRoute() {
  const { token, user } = useAuth();
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Nueva suscripción"
        description="Sólo se muestran clientes activos y productos activos."
      />
      <BentoCard>
        <SubscriptionForm
          token={token}
          isAdmin={user?.role === 'admin'}
          onCreated={(s) => router.push(`/subscriptions/${s.id}`)}
        />
      </BentoCard>
    </div>
  );
}
