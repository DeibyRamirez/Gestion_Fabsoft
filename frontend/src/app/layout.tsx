import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/auth-provider';
import { SkipLink } from '@/shared/components/skip-link';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'FabSoft',
  description: 'Clientes, suscripciones y renovaciones',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO" className={inter.variable}>
      <body className="min-h-screen">
        <SkipLink />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
