import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PortalMe,
  PortalPeriod,
  PortalRenewalRequest,
  PortalSubscription,
} from '@fabsoft/shared';
import { PortalContactPage } from './portal-contact-page';
import { PortalPage } from './portal-page';
import { PortalRequestsPage } from './portal-requests-page';
import { PortalSubscriptionDetail } from './portal-subscription-detail';

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  subscriptions: vi.fn(),
  subscription: vi.fn(),
  periods: vi.fn(),
  renewalRequests: vi.fn(),
  createRenewalRequest: vi.fn(),
}));

vi.mock('./api', () => ({ portalApi: mocks }));

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    token: 't',
    user: {
      id: '00000000-0000-4000-8000-000000000101',
      email: 'cliente@test.dev',
      fullName: 'Cliente',
      role: 'client',
      clientId: '00000000-0000-4000-8000-000000000102',
      mustChangePassword: false,
    },
  }),
}));

const subscription: PortalSubscription = {
  id: '00000000-0000-4000-8000-000000000201',
  productName: 'Microsoft 365',
  contractReference: null,
  startDate: '2026-01-01',
  currentPeriodEnd: '2026-12-31',
  daysUntilExpiration: 42,
  billingCycle: 'annual',
  priceAmount: '1200000.00',
  currency: 'COP',
  status: 'activa',
  renewalTerms: null,
  hasOpenRenewalRequest: false,
};

const period: PortalPeriod = {
  periodNumber: 1,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  billingCycle: 'annual',
  priceAmount: '1200000.00',
  currency: 'COP',
  renewalOutcome: 'pendiente',
};

const request: PortalRenewalRequest = {
  id: '00000000-0000-4000-8000-000000000301',
  subscriptionId: subscription.id,
  productName: 'Microsoft 365',
  comment: 'Queremos continuar',
  status: 'pendiente_revision',
  resolution: null,
  resolutionNote: null,
  createdAt: '2026-11-19T15:00:00.000Z',
  resolvedAt: null,
};

const me: PortalMe = {
  user: {
    id: '00000000-0000-4000-8000-000000000101',
    email: 'cliente@test.dev',
    fullName: 'Cliente',
    role: 'client',
    clientId: '00000000-0000-4000-8000-000000000102',
    mustChangePassword: false,
  },
  organization: {
    id: '00000000-0000-4000-8000-000000000102',
    legalName: 'Comercializadora Andina',
    taxId: '900.123.456-7',
  },
  contactChannel: {
    email: 'contacto@fabsoft.test',
    phone: '+57 300 000 0000',
    hours: 'Lunes a viernes, 8:00-17:00',
  },
};

const meta = { page: 1, pageSize: 50, total: 1, totalPages: 1 };

beforeEach(() => {
  mocks.me.mockReset();
  mocks.subscriptions.mockReset();
  mocks.subscription.mockReset();
  mocks.periods.mockReset();
  mocks.renewalRequests.mockReset();
  mocks.createRenewalRequest.mockReset();
  mocks.me.mockResolvedValue(me);
  mocks.subscriptions.mockResolvedValue({ data: [subscription], meta });
  mocks.subscription.mockResolvedValue(subscription);
  mocks.periods.mockResolvedValue({ data: [period] });
  mocks.renewalRequests.mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
  mocks.createRenewalRequest.mockResolvedValue(request);
});

describe('Portal pages', () => {
  it('muestra las suscripciones de la organización', async () => {
    render(<PortalPage />);
    expect(await screen.findByText('Microsoft 365')).toBeInTheDocument();
    expect(screen.getByText(/Comercializadora Andina/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute(
      'href',
      `/portal/subscriptions/${subscription.id}`,
    );
    expect(screen.getByRole('link', { name: 'Solicitar renovación' })).toHaveAttribute(
      'href',
      `/portal/subscriptions/${subscription.id}#solicitar`,
    );
  });

  it('muestra el detalle, historial y envía una solicitud', async () => {
    render(<PortalSubscriptionDetail subscriptionId={subscription.id} />);
    expect(await screen.findByText('Historial de periodos')).toBeInTheDocument();
    expect(screen.getAllByText('Anual').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Comentario (opcional)'), {
      target: { value: 'Queremos continuar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() =>
      expect(mocks.createRenewalRequest).toHaveBeenCalledWith('t', {
        subscriptionId: subscription.id,
        comment: 'Queremos continuar',
      }),
    );
    expect(await screen.findByText(/Solicitud enviada/)).toBeInTheDocument();
  });

  it('lista las solicitudes y su estado', async () => {
    mocks.renewalRequests.mockResolvedValue({ data: [request], meta });
    render(<PortalRequestsPage />);
    expect((await screen.findAllByText('Pendiente de revisión')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Queremos continuar').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Microsoft 365' })[0]).toHaveAttribute(
      'href',
      `/portal/subscriptions/${subscription.id}`,
    );
  });

  it('muestra el canal de contacto', async () => {
    render(<PortalContactPage />);
    expect(await screen.findByRole('link', { name: 'contacto@fabsoft.test' })).toHaveAttribute(
      'href',
      'mailto:contacto@fabsoft.test',
    );
    expect(screen.getByText('+57 300 000 0000')).toBeInTheDocument();
    expect(screen.getByText('Lunes a viernes, 8:00-17:00')).toBeInTheDocument();
  });
});
