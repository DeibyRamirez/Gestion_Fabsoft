import { LoginForm } from '@/features/auth/login-form';
import { AuthPageLayout } from '@/shared/components/auth-page-layout';

export const metadata = { title: 'Ingresar · FabSoft' };

export default function LoginPage() {
  return (
    <AuthPageLayout title="Ingresar a FabSoft" description="Accede con tu cuenta de FabSoft.">
      <LoginForm />
    </AuthPageLayout>
  );
}
