import type { ReactNode } from 'react';
import { AppHeader } from '@/features/auth/app-header';
import { RoleGate } from '@/features/auth/role-gate';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate roles={['client']}>
      <AppHeader />
      <main style={{ padding: 24 }}>{children}</main>
    </RoleGate>
  );
}
