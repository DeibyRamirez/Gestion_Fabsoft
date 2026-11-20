'use client';

import Link from 'next/link';
import type { ClientDto, ClientPage } from '@fabsoft/shared';
import { CopyButton } from '@/shared/components/copy-button';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function ClientsTable({ page }: { page: ClientPage }) {
  const desktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Razón social</TableHead>
          <TableHead>NIT</TableHead>
          <TableHead>ID cliente</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Responsable</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.data.map((client: ClientDto) => (
          <TableRow key={client.id}>
            <TableCell>
              <Link
                className="font-semibold text-fg hover:text-link hover:underline"
                href={`/clients/${client.id}`}
              >
                {client.legalName}
              </Link>
            </TableCell>
            <TableCell>
              {client.taxId ? (
                <span className="tabular font-mono text-xs">{client.taxId}</span>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex max-w-64 items-center gap-2">
                <span className="min-w-0 break-all font-mono text-[11px]">{client.id}</span>
                <CopyButton
                  value={client.id}
                  label=""
                  size="icon"
                  aria-label={`Copiar ID de ${client.legalName}`}
                />
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge kind="client" value={client.status} />
            </TableCell>
            <TableCell className="text-fg-muted">{client.owner?.fullName ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const mobile = (
    <MobileCardList>
      {page.data.map((client: ClientDto) => (
        <MobileCard key={client.id}>
          <div className="flex items-start justify-between gap-3">
            <Link
              className="min-w-0 font-semibold text-fg hover:text-link hover:underline"
              href={`/clients/${client.id}`}
            >
              {client.legalName}
            </Link>
            <StatusBadge kind="client" value={client.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <span className="tabular font-mono">{client.taxId ?? 'Sin NIT'}</span>
            <span>{client.owner?.fullName ?? 'Sin responsable'}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1 text-xs">
            <span className="shrink-0 text-fg-muted">ID:</span>
            <span className="min-w-0 break-all font-mono">{client.id}</span>
            <CopyButton
              value={client.id}
              label=""
              size="icon"
              aria-label={`Copiar ID de ${client.legalName}`}
            />
          </div>
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return <ResponsiveDataView desktop={desktop} mobile={mobile} />;
}
