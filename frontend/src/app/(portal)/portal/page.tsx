export const metadata = { title: 'Portal · FabSoft' };

export default function PortalPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg">
          Mis suscripciones
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Aquí verás el resumen de tus suscripciones cuando el portal esté conectado a la API.
        </p>
      </header>
      <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
        Resumen de suscripciones: pendiente (corte de portal con datos).
      </p>
    </div>
  );
}
