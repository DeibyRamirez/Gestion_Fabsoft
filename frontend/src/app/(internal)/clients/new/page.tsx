'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-provider';
import { ClientForm } from '@/features/clients/client-form';
import { PageHeader } from '@/shared/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

export default function NewClientPage() {
  const { token } = useAuth();
  const router = useRouter();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader breadcrumbs={['Gestión', 'Clientes']} title="Nuevo cliente" />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Datos del cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm token={token} onCreated={(c) => router.push(`/clients/${c.id}`)} />
        </CardContent>
      </Card>
    </div>
  );
}
