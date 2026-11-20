'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Building2Icon, DownloadIcon } from 'lucide-react';
import type { ClientPage } from '@fabsoft/shared';
import { ApiError, apiFetch, downloadCsv } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterBar, FilterField, SearchInput } from '@/shared/components/filter-bar';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { ClientsTable } from './clients-table';

export function ClientsPage() {
  const { token } = useAuth();
  const [page, setPage] = useState<ClientPage | null>(null);
  const [q, setQ] = useState('');
  const [taxId, setTaxId] = useState('');
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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

  async function exportCsv() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (taxId.trim()) params.set('taxId', taxId.trim());
    setExporting(true);
    try {
      const query = params.toString();
      await downloadCsv(`/clients/export${query ? `?${query}` : ''}`, token);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Clientes"
        description="Alta, búsqueda y ficha de clientes."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void exportCsv()}
              disabled={exporting}
            >
              <DownloadIcon aria-hidden />
              {exporting ? 'Exportando…' : 'Exportar CSV'}
            </Button>
            <Button asChild>
              <Link href="/clients/new">Nuevo cliente</Link>
            </Button>
          </>
        }
      />

      {message ? (
        <div
          role="status"
          className="rounded-xl bg-status-expired-bg px-4 py-3 text-sm text-status-expired-fg"
        >
          {message}
        </div>
      ) : null}

      <FilterBar
        actions={
          <Button type="button" variant="outline" onClick={reload}>
            Actualizar
          </Button>
        }
      >
        <FilterField label="Buscar" htmlFor="client-search" className="sm:col-span-2">
          <SearchInput
            id="client-search"
            placeholder="Nombre o NIT"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar por nombre"
          />
        </FilterField>
        <FilterField label="NIT exacto" htmlFor="client-tax-id">
          <Input
            id="client-tax-id"
            placeholder="900.123.456-7"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            aria-label="Buscar por NIT"
          />
        </FilterField>
      </FilterBar>

      {page ? (
        page.data.length === 0 ? (
          <EmptyState
            icon={Building2Icon}
            title="No hay clientes con estos filtros."
            description="Prueba con otro nombre o NIT, o crea el primer cliente."
            action={
              <Button asChild size="sm">
                <Link href="/clients/new">Nuevo cliente</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <ClientsTable page={page} />
            </CardContent>
          </Card>
        )
      ) : (
        <LoadingState label="Cargando clientes…" />
      )}
    </div>
  );
}
