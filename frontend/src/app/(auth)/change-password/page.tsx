import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { AuthPageLayout } from '@/shared/components/auth-page-layout';

export const metadata = { title: 'Cambiar contraseña · FabSoft' };

export default function ChangePasswordPage() {
  return (
    <AuthPageLayout title="Cambiar contraseña" description="Actualiza tu contraseña de acceso.">
      <ChangePasswordForm />
    </AuthPageLayout>
  );
}
