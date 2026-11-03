import type { ReactNode } from 'react';
import { RoleGate } from '@/features/auth/role-gate';
import { PortalShell } from '@/shared/components/portal-shell';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate roles={['client']}>
      <PortalShell>{children}</PortalShell>
    </RoleGate>
  );
}
