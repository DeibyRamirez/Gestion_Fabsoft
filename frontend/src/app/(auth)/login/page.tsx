import { LoginForm } from '@/features/auth/login-form';

export const metadata = { title: 'Ingresar · FabSoft' };

export default function LoginPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Ingresar a FabSoft</h1>
      <LoginForm />
    </main>
  );
}
