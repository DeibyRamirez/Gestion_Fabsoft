import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardIndicator } from '@fabsoft/shared';
import { indicatorHref, KpiCard } from './kpi-card';

const indicator = (over: Partial<DashboardIndicator>): DashboardIndicator => ({
  count: 3,
  resource: 'subscriptions',
  filter: { status: 'active,in_renewal' },
  ...over,
});

describe('Dashboard KpiCard', () => {
  it('construye la ruta filtrada según el recurso', () => {
    expect(indicatorHref(indicator({}))).toBe('/subscriptions?status=active%2Cin_renewal');

    const tasks = indicatorHref(
      indicator({
        resource: 'renewal-tasks',
        filter: { status: 'pending,in_progress', overdue: 'true' },
      }),
    );
    expect(tasks.startsWith('/tasks?')).toBe(true);
    expect(tasks).toContain('overdue=true');

    const requests = indicatorHref(
      indicator({ resource: 'renewal-requests', filter: { status: 'pending_review' } }),
    );
    expect(requests).toBe('/renewal-requests?status=pending_review');
  });

  it('muestra el valor y enlaza al listado', () => {
    render(<KpiCard label="Suscripciones activas" indicator={indicator({ count: 7 })} />);
    const link = screen.getByRole('link', { name: /Suscripciones activas/ });
    expect(link).toHaveAttribute('href', '/subscriptions?status=active%2Cin_renewal');
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
