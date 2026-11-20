import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductDto, ProductPage } from '@fabsoft/shared';
import { ProductsAdmin } from './products-admin';

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

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    token: 't',
    user: {
      id: '00000000-0000-4000-8000-000000000101',
      email: 'admin@fabsoft.test',
      fullName: 'Admin',
      role: 'admin',
      clientId: null,
      mustChangePassword: false,
    },
    ready: true,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

const activeProduct: ProductDto = {
  id: '00000000-0000-4000-8000-000000000201',
  name: 'Microsoft 365',
  description: null,
  productType: 'third_party',
  vendor: 'Microsoft',
  referenceCode: null,
  status: 'activo',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const inactiveProduct: ProductDto = {
  ...activeProduct,
  id: '00000000-0000-4000-8000-000000000202',
  name: 'Soporte anual',
  productType: 'own',
  vendor: null,
  status: 'inactivo',
};

const productPage: ProductPage = {
  data: [activeProduct, inactiveProduct],
  meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
};

function mockCatalog() {
  fetchMock.mockImplementation((path: string) => {
    if (path.startsWith('/products?')) return Promise.resolve(productPage);
    return Promise.resolve({});
  });
}

describe('ProductsAdmin', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('muestra el catálogo sin campos de precio ni periodicidad', async () => {
    mockCatalog();
    render(<ProductsAdmin />);

    expect(await screen.findByText('Microsoft 365')).toBeInTheDocument();
    expect(screen.getByText('Soporte anual')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Precio/i)).toBeNull();
    expect(screen.queryByLabelText(/Periodicidad/i)).toBeNull();
    expect(screen.getByText(/El catálogo no guarda precio ni periodicidad/i)).toBeInTheDocument();
  });

  it('crea un producto con nombre y tipo, sin precio ni periodicidad', async () => {
    mockCatalog();
    render(<ProductsAdmin />);

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Servicio nuevo' },
    });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'own' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => c[0] === '/products' && (c[1] as { method?: string }).method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call?.[1] as { body: string }).body);
      expect(body).toEqual({
        name: 'Servicio nuevo',
        productType: 'own',
        description: null,
        vendor: null,
        referenceCode: null,
      });
      expect(body).not.toHaveProperty('priceAmount');
      expect(body).not.toHaveProperty('billingCycle');
    });
    expect(
      await screen.findByText('Producto creado. Ya está disponible para nuevas suscripciones.'),
    ).toBeInTheDocument();
  });

  it('desactivar envía status inactivo y no borra el producto', async () => {
    mockCatalog();
    render(<ProductsAdmin />);

    await screen.findByText('Microsoft 365');
    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          c[0] === `/products/${activeProduct.id}` &&
          (c[1] as { method?: string }).method === 'PATCH',
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call?.[1] as { body: string }).body)).toEqual({ status: 'inactivo' });
    });
    expect(
      await screen.findByText(
        'Producto desactivado. No se ofrece para nuevas suscripciones; las existentes no cambian.',
      ),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((c) => (c[1] as { method?: string }).method === 'DELETE'),
    ).toBe(false);
  });

  it('edita un producto y envía los campos del catálogo', async () => {
    mockCatalog();
    render(<ProductsAdmin />);

    await screen.findByText('Microsoft 365');
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    expect(await screen.findByText('Editar producto')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Microsoft 365 Business' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          c[0] === `/products/${activeProduct.id}` &&
          (c[1] as { method?: string }).method === 'PATCH',
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call?.[1] as { body: string }).body)).toMatchObject({
        name: 'Microsoft 365 Business',
        productType: 'third_party',
      });
    });
  });
});
