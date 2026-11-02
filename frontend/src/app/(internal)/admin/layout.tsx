import type { ReactNode } from 'react';
import { RoleGate } from '@/features/auth/role-gate';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RoleGate roles={['admin']}>{children}</RoleGate>;
}
