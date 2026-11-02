import { ApiStatus } from '@/features/health/api-status';

export const metadata = { title: 'Panel · FabSoft' };

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg">Panel</h1>
        <p className="mt-1 text-sm text-fg-muted">Estado del sistema y conectividad con la API.</p>
      </header>
      <ApiStatus />
    </div>
  );
}
