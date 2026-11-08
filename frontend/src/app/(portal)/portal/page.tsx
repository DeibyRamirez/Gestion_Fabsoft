import { PageHeader } from '@/shared/components/page-header';
import { Card, CardContent } from '@/shared/ui/card';

export const metadata = { title: 'Portal · FabSoft' };

export default function PortalPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mis suscripciones"
        description="Aquí verás el resumen de tus suscripciones cuando el portal esté conectado a la API."
      />
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-fg-muted">
            Resumen de suscripciones: pendiente (corte de portal con datos). Esta pantalla existe
            como contenedor; no se muestran datos de demostración.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
