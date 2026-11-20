import type { ReactNode } from 'react';
import { FabSoftLogo } from '@/shared/components/fabsoft-logo';
import { Card, CardContent, CardDescription, CardHeader } from '@/shared/ui/card';

type AuthPageLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function AuthPageLayout({ title, description, children }: AuthPageLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row lg:p-3">
      <aside className="nebula-surface relative hidden overflow-hidden rounded-2xl p-8 text-white shadow-nebula lg:flex lg:w-[min(42%,30rem)] lg:shrink-0 lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute -inset-[20%] opacity-60 motion-safe:animate-drift"
          style={{
            background:
              'radial-gradient(40% 40% at 70% 20%, rgb(0 200 240 / 0.22), transparent 70%)',
          }}
        />
        <div aria-hidden className="nebula-grain absolute inset-0" />
        <div className="relative">
          <FabSoftLogo href={null} variant="onDark" />
          <p className="mt-12 max-w-sm text-3xl leading-snug font-extrabold tracking-tight">
            Clientes, licencias y renovaciones en un{' '}
            <span className="font-serif font-normal text-on-nebula-cyan italic">solo lugar.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/85">
            Consola operativa para administradores, operadores y clientes.
          </p>
        </div>
        <div className="relative mt-12 max-w-xs opacity-50" aria-hidden>
          <div className="flex flex-col gap-2">
            <div className="h-3 w-full rounded-full border border-white/30" />
            <div className="h-3 w-4/5 rounded-full border border-white/25" />
            <div className="h-3 w-3/5 rounded-full border border-white/20" />
          </div>
          <p className="mt-6 font-serif text-lg text-white/80 italic">Control de suscripciones</p>
        </div>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <FabSoftLogo href={null} />
          </div>
          <Card className="rounded-2xl">
            <CardHeader className="p-6 pb-2">
              <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-fg">
                {title}
              </h1>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="p-6 pt-0">{children}</CardContent>
          </Card>
          <p className="mt-4 text-center text-xs text-fg-muted">
            FabSoft · Control de suscripciones
          </p>
        </div>
      </div>
    </div>
  );
}
