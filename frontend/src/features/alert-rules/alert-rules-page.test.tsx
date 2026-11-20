import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ALERT_EMAIL_TEMPLATE,
  type AlertRuleDto,
  type AlertRuleList,
} from '@fabsoft/shared';
import { ApiError } from '@/shared/api/client';
import { AlertRulesPage } from './alert-rules-page';

const fetchMock = vi.fn();

vi.mock('@/shared/api/client', () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
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

const r = (over: Partial<AlertRuleDto>): AlertRuleDto => ({
  id: '00000000-0000-4000-8000-000000000301',
  code: 'D30',
  description: 'Preparar renovación',
  offsetDays: 30,
  channels: ['in_app', 'email'],
  createsTask: true,
  taskType: 'send_proposal',
  taskPriority: 'medium',
  appliesWhenNotRenewable: false,
  isActive: true,
  ...over,
});

const template = { ...DEFAULT_ALERT_EMAIL_TEMPLATE };

const list: AlertRuleList = {
  data: [
    r({}),
    r({
      id: '00000000-0000-4000-8000-000000000302',
      code: 'D15',
      description: 'Contactar cliente',
      offsetDays: 15,
      taskType: 'contact_client',
      taskPriority: 'high',
    }),
  ],
};

describe('AlertRulesPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lista reglas y guarda el nuevo umbral', async () => {
    fetchMock.mockImplementation((path: string) => {
      if (path === '/alert-rules') return Promise.resolve(list);
      if (path === '/alert-rules/email-template') return Promise.resolve(template);
      if (path === '/alert-rules/00000000-0000-4000-8000-000000000301') {
        return Promise.resolve(r({ offsetDays: 45 }));
      }
      return Promise.resolve({});
    });
    render(<AlertRulesPage />);

    expect(await screen.findByText('D30')).toBeInTheDocument();
    expect(screen.getByText('Preparar renovación')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/alert-rules/00000000-0000-4000-8000-000000000301',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"offsetDays":45'),
        }),
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Se aplicará en la próxima reconciliación',
    );
  });

  it('muestra el conflicto de umbral duplicado', async () => {
    fetchMock.mockImplementation((path: string) => {
      if (path === '/alert-rules') return Promise.resolve(list);
      if (path === '/alert-rules/email-template') return Promise.resolve(template);
      if (path === '/alert-rules/00000000-0000-4000-8000-000000000301') {
        return Promise.reject(new ApiError(409, null));
      }
      return Promise.resolve({});
    });
    render(<AlertRulesPage />);
    expect(await screen.findByText('D30')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Ya existe otra regla con ese umbral'),
    );
  });

  it('guarda la plantilla de correo editable', async () => {
    fetchMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/alert-rules') return Promise.resolve(list);
      if (path === '/alert-rules/email-template' && init?.method === 'PATCH') {
        return Promise.resolve({ ...template, subject: 'Nuevo asunto' });
      }
      if (path === '/alert-rules/email-template') return Promise.resolve(template);
      return Promise.resolve({});
    });
    render(<AlertRulesPage />);

    const subject = await screen.findByLabelText('Asunto');
    fireEvent.change(subject, { target: { value: 'Nuevo asunto {{clientName}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plantilla' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/alert-rules/email-template',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('Nuevo asunto {{clientName}}'),
        }),
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Plantilla actualizada');
  });
});
