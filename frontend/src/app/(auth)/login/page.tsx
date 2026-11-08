import { LoginForm } from '@/features/auth/login-form';
import { AuthPageLayout } from '@/shared/components/auth-page-layout';

export const metadata = { title: 'Iniciar sesión · FabSoft' };

export default function LoginPage() {
  return (
    <AuthPageLayout title="Iniciar sesión" description="Ingresa con tu cuenta para continuar.">
      <LoginForm />
    </AuthPageLayout>
  );
}
