'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';

export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <header style={{ display: 'flex', gap: 16, padding: 12, borderBottom: '1px solid #ddd' }}>
      <strong>FabSoft</strong>
      {user.role !== 'client' && <Link href="/dashboard">Inicio</Link>}
      {user.role === 'admin' && <Link href="/admin/users">Usuarios</Link>}
      <span style={{ marginLeft: 'auto' }}>
        {user.fullName} ({user.role})
      </span>
      <button
        type="button"
        onClick={async () => {
          await logout();
          router.replace('/login');
        }}
      >
        Cerrar sesión
      </button>
    </header>
  );
}
