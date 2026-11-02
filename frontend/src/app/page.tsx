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
  return <p aria-busy="true">Cargando…</p>;
}
