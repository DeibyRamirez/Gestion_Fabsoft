import type { Metadata } from 'next';
import { Instrument_Serif, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/auth-provider';
import { SkipLink } from '@/shared/components/skip-link';
import { ToastProvider } from '@/shared/ui/toast';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'FabSoft',
  description: 'Clientes, suscripciones y renovaciones',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es-CO"
      className={`${jakarta.variable} ${instrument.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen">
        <SkipLink />
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
