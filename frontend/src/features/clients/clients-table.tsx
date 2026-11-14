'use client';

import Link from 'next/link';
import type { ClientDto, ClientPage } from '@fabsoft/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

export function ClientsTable({ page }: { page: ClientPage }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Razón social</TableHead>
          <TableHead>NIT / ID</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Responsable</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.data.map((c: ClientDto) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link className="text-link hover:underline" href={`/clients/${c.id}`}>
                {c.legalName}
              </Link>
            </TableCell>
            <TableCell>{c.taxId ?? '—'}</TableCell>
            <TableCell>{c.status}</TableCell>
            <TableCell>{c.owner?.fullName ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}