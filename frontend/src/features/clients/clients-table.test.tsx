import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClientsTable } from './clients-table';

describe('ClientsTable', () => {
  it('muestra filas del listado', () => {
    render(
      <ClientsTable
        page={{
          data: [
            {
              id: '00000000-0000-4000-8000-000000000101',
              legalName: 'Acme SAS',
              taxId: '900111222-3',
              status: 'activo',
              email: null,
              phone: null,
              owner: { id: '00000000-0000-4000-8000-000000000201', fullName: 'Ana Admin' },
              archivedAt: null,
              createdAt: '2026-11-01T00:00:00.000Z',
              updatedAt: '2026-11-01T00:00:00.000Z',
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }}
      />,
    );
    expect(screen.getAllByRole('link', { name: 'Acme SAS' })[0]).toHaveAttribute(
      'href',
      '/clients/00000000-0000-4000-8000-000000000101',
    );
    expect(screen.getAllByText('Ana Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('00000000-0000-4000-8000-000000000101').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'ID cliente' }).length).toBeGreaterThan(0);
  });
});
