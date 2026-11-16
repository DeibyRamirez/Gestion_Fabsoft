import { ApiStatus } from '@/features/health/api-status';
import { PageHeader } from '@/shared/components/page-header';

export const metadata = { title: 'Panel · FabSoft' };

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Panel"
        description="Estado del sistema y conectividad con la API."
      />
      <ApiStatus />
    </div>
  );
}
