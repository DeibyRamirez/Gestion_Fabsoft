import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientDto, ProductDto } from '@fabsoft/shared';
import { SubscriptionForm } from './subscription-form';

const fetchMock = vi.fn();

vi.mock('@/shared/api/client', () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
  ApiError: class ApiError extends Error {
    problem?: { code?: string } | undefined;
    constructor(msg: string, problem?: { code?: string } | undefined) {
      super(msg);
      this.problem = problem;
    }
  },
}));

const activeClient: ClientDto = {
  id: '00000000-0000-4000-8000-000000000101',
  legalName: 'Cliente Activo',
  taxId: null,
  status: 'activo',
  email: null,
  phone: null,
  owner: null,
  archivedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const archivedClient: ClientDto = {
  ...activeClient,
  id: '00000000-0000-4000-8000-000000000102',
  legalName: 'Cliente Archivado',
  status: 'archivado',
};
const activeProduct: ProductDto = {
  id: '00000000-0000-4000-8000-000000000201',
  name: 'Producto Activo',
  description: null,
  productType: 'third_party',
  vendor: null,
  referenceCode: null,
  status: 'activo',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const inactiveProduct: ProductDto = {
  ...activeProduct,
  id: '00000000-0000-4000-8000-000000000202',
  name: 'Producto Inactivo',
  status: 'inactivo',
};

function mockCatalog() {
  fetchMock.mockImplementation((path: string) => {
    if (path === '/clients/assignable-owners') {
      return Promise.resolve({ data: [] });
    }
    if (path.startsWith('/clients')) {
      return Promise.resolve({ data: [activeClient, archivedClient] });
    }
    if (path.startsWith('/products')) {
      return Promise.resolve({ data: [activeProduct, inactiveProduct] });
    }
    return Promise.resolve({});
  });
}

async function fillForm() {
  await screen.findByRole('option', { name: 'Cliente Activo' });
  fireEvent.change(screen.getByLabelText('Cliente activo'), {
    target: { value: activeClient.id },
  });
  fireEvent.change(screen.getByLabelText('Producto activo'), {
    target: { value: activeProduct.id },
  });
  fireEvent.change(screen.getByLabelText('Fecha de inicio'), {
    target: { value: '2026-11-01' },
  });
  fireEvent.change(screen.getByLabelText(/Precio/), { target: { value: '100000' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Crear suscripción' }));
}

describe('SubscriptionForm', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('oculta clientes archivados y productos inactivos', async () => {
    mockCatalog();
    render(<SubscriptionForm token="t" />);
    expect(await screen.findByRole('option', { name: 'Cliente Activo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Producto Activo' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cliente Archivado' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Producto Inactivo' })).toBeNull();
  });

  it('envía POST con Idempotency-Key al crear', async () => {
    mockCatalog();
    fetchMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/clients/assignable-owners') return Promise.resolve({ data: [] });
      if (path.startsWith('/clients')) return Promise.resolve({ data: [activeClient] });
      if (path.startsWith('/products')) return Promise.resolve({ data: [activeProduct] });
      if (path === '/subscriptions' && init?.method === 'POST') {
        return Promise.resolve({ id: 'sub-1' });
      }
      return Promise.resolve({});
    });
    render(<SubscriptionForm token="t" />);
    await fillForm();

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/subscriptions');
      expect(call).toBeTruthy();
      expect(
        (call?.[1] as { headers?: Record<string, string> }).headers?.['Idempotency-Key'],
      ).toBeTruthy();
      const payload = JSON.parse((call?.[1] as { body: string }).body) as {
        priceAmount: string;
        isRenewable: boolean;
        visibleInPortal: boolean;
        supplierCostAmount?: string;
      };
      expect(payload.priceAmount).toBe('100000.00');
      expect(payload.isRenewable).toBe(true);
      expect(payload.visibleInPortal).toBe(true);
      expect(payload.supplierCostAmount).toBeUndefined();
    });
  });

  it('muestra el mensaje si la API rechaza', async () => {
    mockCatalog();
    fetchMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/clients/assignable-owners') return Promise.resolve({ data: [] });
      if (path.startsWith('/clients')) return Promise.resolve({ data: [activeClient] });
      if (path.startsWith('/products')) return Promise.resolve({ data: [activeProduct] });
      if (path === '/subscriptions' && init?.method === 'POST') {
        return Promise.reject(new Error('product_inactive'));
      }
      return Promise.resolve({});
    });
    render(<SubscriptionForm token="t" />);
    await fillForm();

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
