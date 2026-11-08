'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { useAuth } from '@/features/auth/auth-provider';
import { AppShell } from '@/shared/components/app-shell';
import { AuthPageLayout } from '@/shared/components/auth-page-layout';
import { PageHeader } from '@/shared/components/page-header';
import { PortalShell } from '@/shared/components/portal-shell';
import { Card, CardContent } from '@/shared/ui/card';

function ChangePasswordContent() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <PageHeader title="Cambiar contraseña" description="Actualiza tu contraseña de acceso." />
      <Card>
        <CardContent className="pt-6">
          <ChangePasswordForm />
        </CardContent>
      </Card>
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
