'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ClientPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { ClientsTable } from './clients-table';

export function ClientsPage() {
  const { token } = useAuth();
  const [page, setPage] = useState<ClientPage | null>(null);
  const [q, setQ] = useState('');
  const [taxId, setTaxId] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ pageSize: '50' });
    if (q.trim()) params.set('q', q.trim());
    if (taxId.trim()) params.set('taxId', taxId.trim());
    apiFetch<ClientPage>(`/clients?${params}`, { token })
      .then((p) => alive && setPage(p))
      .catch(() => alive && setPage(null));
    return () => {
      alive = false;
    };
  }, [token, q, taxId, version]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Clientes"
        description="Alta, búsqueda y ficha de clientes."
        actions={
          <Button asChild>
            <Link href="/clients/new">Nuevo cliente</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Búsqueda</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row">
          <Input
            placeholder="Nombre o NIT"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar por nombre"
          />
          <Input
            placeholder="NIT exacto"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            aria-label="Buscar por NIT"
          />
          <Button type="button" variant="secondary" onClick={reload}>
            Actualizar
          </Button>
        </CardContent>
      </Card>
      {page ? (
        <Card>
          <CardContent className="pt-6">
            <ClientsTable page={page} />
          </CardContent>
        </Card>
      ) : (
        <p>Cargando clientes…</p>
      )}
    </div>
  );
}