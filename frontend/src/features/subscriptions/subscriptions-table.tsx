'use client';

import Link from 'next/link';
import type { SubscriptionDto, SubscriptionPage } from '@fabsoft/shared';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { formatCop, formatDate } from '@/shared/lib/format';
import { BILLING_CYCLE_LABELS } from '@/shared/lib/labels';
import { StatusBadge, UrgencyBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function SubscriptionsTable({ page }: { page: SubscriptionPage }) {
  const desktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>Vence</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Precio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.data.map((subscription: SubscriptionDto) => (
          <TableRow key={subscription.id}>
            <TableCell>
              <Link
                className="font-semibold text-fg hover:text-link hover:underline"
                href={`/subscriptions/${subscription.id}`}
              >
                {subscription.client.legalName}
              </Link>
            </TableCell>
            <TableCell>
              <span className="block text-sm text-fg">{subscription.product.name}</span>
              <span className="block text-xs text-fg-muted">
                {BILLING_CYCLE_LABELS[subscription.billingCycle]}
              </span>
            </TableCell>
            <TableCell>
              <span className="block text-sm">{formatDate(subscription.currentPeriodEnd)}</span>
              <UrgencyBadge days={subscription.daysUntilExpiration} className="mt-1" />
            </TableCell>
            <TableCell>
              <StatusBadge kind="subscription" value={subscription.status} />
            </TableCell>
            <TableCell className="text-right">
              <span className="tabular font-mono text-xs">
                {formatCop(subscription.priceAmount)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const mobile = (
    <MobileCardList>
      {page.data.map((subscription: SubscriptionDto) => (
        <MobileCard key={subscription.id}>
          <div className="flex items-start justify-between gap-3">
            <Link
              className="min-w-0 font-semibold text-fg hover:text-link hover:underline"
              href={`/subscriptions/${subscription.id}`}
            >
              {subscription.client.legalName}
            </Link>
            <StatusBadge kind="subscription" value={subscription.status} />
          </div>
          <p className="text-xs text-fg-muted">
            {subscription.product.name} · {BILLING_CYCLE_LABELS[subscription.billingCycle]}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>Vence {formatDate(subscription.currentPeriodEnd)}</span>
            <UrgencyBadge days={subscription.daysUntilExpiration} />
          </div>
          <p className="tabular font-mono text-xs text-fg">{formatCop(subscription.priceAmount)}</p>
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return <ResponsiveDataView desktop={desktop} mobile={mobile} />;
}
