'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { homePathForRole, type UserRole } from '@fabsoft/shared';
import { useAuth } from './auth-provider';

/** Guarda de UX: la autorización real está en la API (RN-15). */
export function RoleGate({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const allowed = !!user && roles.includes(user.role) && !user.mustChangePassword;

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login');
    else if (user.mustChangePassword) router.replace('/change-password');
    else if (!roles.includes(user.role)) router.replace(homePathForRole(user.role));
  }, [ready, user, roles, router]);

  if (!ready || !allowed) return <p aria-busy="true">Cargando…</p>;
  return <>{children}</>;
}
