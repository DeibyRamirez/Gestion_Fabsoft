import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/auth-provider';

export const metadata: Metadata = {
  title: 'FabSoft',
  description: 'Clientes, suscripciones y renovaciones',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
