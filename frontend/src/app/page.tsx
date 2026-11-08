'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homePathForRole } from '@fabsoft/shared';
import { useAuth } from '@/features/auth/auth-provider';

/** Redirige según la sesión y el rol. */
export default function HomePage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(user ? homePathForRole(user.role) : '/login');
  }, [ready, user, router]);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-bg px-4"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="text-sm text-fg-muted">Cargando…</p>
    </div>
  );
}
