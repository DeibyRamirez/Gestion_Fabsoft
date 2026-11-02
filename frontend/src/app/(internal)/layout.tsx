import type { ReactNode } from 'react';
import { AppHeader } from '@/features/auth/app-header';
import { RoleGate } from '@/features/auth/role-gate';

export default function InternalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate roles={['admin', 'operator']}>
      <AppHeader />
      <main style={{ padding: 24 }}>{children}</main>
    </RoleGate>
  );
}
