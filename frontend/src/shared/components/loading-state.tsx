export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p role="status" aria-busy="true" className="text-sm text-fg-muted">
      {label}
    </p>
  );
}
