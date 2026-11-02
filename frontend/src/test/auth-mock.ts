import { vi } from 'vitest';
import type { Me } from '@fabsoft/shared';

export const router = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

export const me = (over: Partial<Me> = {}): Me => ({
  id: '00000000-0000-4000-8000-000000000101',
  email: 'admin@fabsoft.test',
  fullName: 'Admin',
  role: 'admin',
  clientId: null,
  mustChangePassword: false,
  ...over,
});
