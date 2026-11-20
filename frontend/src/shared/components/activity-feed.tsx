import {
  BellRingIcon,
  Building2Icon,
  CircleDotIcon,
  ListChecksIcon,
  PackageIcon,
  PlugIcon,
  RepeatIcon,
  ShieldAlertIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { activityLabel } from '@/shared/lib/labels';
import { formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

export type ActivityItem = {
  id: string;
  action: string;
  occurredAt: string;
  actor?: { name: string } | null;
  summary?: string | null;
};

function iconFor(action: string): LucideIcon {
  if (action.startsWith('client')) return Building2Icon;
  if (action.startsWith('subscription')) return RepeatIcon;
  if (action.startsWith('task')) return ListChecksIcon;
  if (action.startsWith('notification')) return BellRingIcon;
  if (action.startsWith('integration') || action.startsWith('api_credential')) return PlugIcon;
  if (action.startsWith('product')) return PackageIcon;
  if (action.startsWith('auth')) return ShieldAlertIcon;
  if (action.startsWith('user')) return UserIcon;
  return CircleDotIcon;
}

function toneFor(action: string): string {
  if (
    action.includes('renewed') ||
    action.includes('activated') ||
    action.includes('completed') ||
    action.includes('created') ||
    action.includes('reactivated')
  ) {
    return 'bg-status-active-bg text-status-active-fg';
  }
  if (
    action.includes('cancelled') ||
    action.includes('archived') ||
    action.includes('failed') ||
    action.includes('revoked') ||
    action.includes('not_renewed')
  ) {
    return 'bg-status-expired-bg text-status-expired-fg';
  }
  if (action.includes('updated') || action.includes('started')) {
    return 'bg-status-in-renewal-bg text-status-in-renewal-fg';
  }
  return 'bg-iris-soft text-iris';
}

export function ActivityFeed({
  items,
  empty = 'Sin actividad registrada.',
  className,
}: {
  items: ActivityItem[];
  empty?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-fg-muted">{empty}</p>;
  }

  return (
    <ul className={cn('flex flex-col', className)}>
      {items.map((item) => {
        const Icon = iconFor(item.action);
        const label = activityLabel(item.action);
        const summaryText = item.summary
          ? item.summary.startsWith(label)
            ? item.summary.slice(label.length).replace(/^[\s·:-]+/, '')
            : item.summary
          : null;
        const showSummary = summaryText && summaryText.length > 0;
        return (
          <li
            key={item.id}
            className="flex gap-3 border-t border-border py-3 first:border-0 first:pt-0 last:pb-0"
          >
            <span
              aria-hidden
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full',
                toneFor(item.action),
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{label}</p>
              {showSummary ? <p className="text-xs text-fg-muted">{summaryText}</p> : null}
              <p className="mt-0.5 text-xs text-fg-muted">
                <span>{item.actor?.name ?? 'Sistema'}</span>
                <span aria-hidden> · </span>
                <span>{formatDateTime(item.occurredAt)}</span>
                <code className="ml-2 font-mono text-[10px] text-fg-muted/80">{item.action}</code>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
