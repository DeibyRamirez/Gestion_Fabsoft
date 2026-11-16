'use client';

import Link from 'next/link';
import type { SubscriptionDto, SubscriptionPage } from '@fabsoft/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function SubscriptionsTable({ page }: { page: SubscriptionPage }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>Vence</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.data.map((s: SubscriptionDto) => (
          <TableRow key={s.id}>
            <TableCell>
              <Link className="text-link hover:underline" href={`/subscriptions/${s.id}`}>
                {s.client.legalName}
              </Link>
            </TableCell>
            <TableCell>{s.product.name}</TableCell>
            <TableCell>{s.currentPeriodEnd}</TableCell>
            <TableCell>{s.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
