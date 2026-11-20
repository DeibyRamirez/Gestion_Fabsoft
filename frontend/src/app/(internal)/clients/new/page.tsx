'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-provider';
import { ClientForm } from '@/features/clients/client-form';
import { BentoCard } from '@/shared/components/bento';
import { PageHeader } from '@/shared/components/page-header';

export default function NewClientPage() {
  const { token } = useAuth();
  const router = useRouter();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Nuevo cliente" description="Datos básicos para dar de alta al cliente." />
      <BentoCard>
        <ClientForm token={token} onCreated={(c) => router.push(`/clients/${c.id}?created=1`)} />
      </BentoCard>
    </div>
  );
}
