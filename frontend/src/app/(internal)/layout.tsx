import type { ReactNode } from 'react';
import { RoleGate } from '@/features/auth/role-gate';
import { AppShell } from '@/shared/components/app-shell';

export default function InternalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate roles={['admin', 'operator']}>
      <AppShell>{children}</AppShell>
    </RoleGate>
  );
}
