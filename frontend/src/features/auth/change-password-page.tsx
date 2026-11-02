'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { useAuth } from '@/features/auth/auth-provider';
import { AppShell } from '@/shared/components/app-shell';
import { AuthPageLayout } from '@/shared/components/auth-page-layout';
import { PortalShell } from '@/shared/components/portal-shell';

function ChangePasswordContent() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <header>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg">
          Cambiar contraseña
        </h1>
        <p className="mt-1 text-sm text-fg-muted">Actualiza tu contraseña de acceso.</p>
      </header>
      <ChangePasswordForm />
    </div>
  );
}

/** Layout según obligatorio (auth centrado) o voluntario (shell del rol). */
export function ChangePasswordPageView() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) return <p aria-busy="true">Cargando…</p>;

  if (user.mustChangePassword) {
    return (
      <AuthPageLayout title="Cambiar contraseña" description="Actualiza tu contraseña de acceso.">
        <ChangePasswordForm />
      </AuthPageLayout>
    );
  }

  if (user.role === 'client') {
    return (
      <PortalShell>
        <ChangePasswordContent />
      </PortalShell>
    );
  }

  return (
    <AppShell>
      <ChangePasswordContent />
    </AppShell>
  );
}
