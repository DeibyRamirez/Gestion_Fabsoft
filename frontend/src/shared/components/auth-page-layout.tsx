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
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside
        className="relative flex flex-col justify-between bg-brand-panel px-8 py-10 text-white lg:w-[min(40%,28rem)] lg:min-h-screen lg:shrink-0"
        aria-hidden={false}
      >
        <div>
          <FabSoftLogo href={null} variant="onDark" />
          <h2 className="mt-10 max-w-sm text-2xl leading-snug font-semibold tracking-tight lg:mt-16 lg:text-3xl">
            Clientes, licencias y renovaciones en un{' '}
            <span className="text-indigo-300">solo lugar.</span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-panel-muted">
            Consola operativa para administradores, operadores y clientes.
          </p>
        </div>
        <div
          className="mt-12 hidden max-w-xs opacity-40 lg:mt-0 lg:block"
          aria-hidden
        >
          <div className="flex flex-col gap-2">
            <div className="h-3 w-full rounded-full border border-white/30" />
            <div className="h-3 w-4/5 rounded-full border border-white/25" />
            <div className="h-3 w-3/5 rounded-full border border-white/20" />
          </div>
        </div>
      </aside>

      <div className="flex flex-1 items-center justify-center bg-bg px-4 py-10">
        <Card className="w-full max-w-md border-border shadow-card">
          <CardHeader className="pb-2">
            <h1 className="text-xl leading-tight font-semibold tracking-tight text-fg">{title}</h1>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
