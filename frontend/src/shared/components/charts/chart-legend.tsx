import { cn } from '@/shared/lib/utils';

export type LegendItem = {
  label: string;
  value: number;
  color: string;
};

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('grid gap-1.5 text-sm', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="min-w-0 flex-1 truncate text-fg-muted">{item.label}</span>
          <span className="tabular font-mono text-xs font-semibold text-fg">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
