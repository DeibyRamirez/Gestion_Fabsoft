'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PlugIcon } from 'lucide-react';
import {
  IntegrationManifestSchema,
  type IntegrationDto,
  type IntegrationManifest,
} from '@fabsoft/shared';
import { ApiError } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { BentoCard } from '@/shared/components/bento';
import { EmptyState } from '@/shared/components/empty-state';
import { FormField } from '@/shared/components/form-field';
import { PageHeader } from '@/shared/components/page-header';
import { SectionHeader } from '@/shared/components/section-header';
import { SCOPE_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Textarea } from '@/shared/ui/textarea';
import { integrationsApi } from './api';

const newManifest = (): IntegrationManifest => ({
  manifest_schema_version: 1,
  integration: `nueva-integracion-${Date.now().toString(36)}`,
  version: '1.0.0',
  display_name: 'Nueva integración',
  scopes: ['subscriptions:read'],
  client_scope: 'all',
  rate_limit_per_minute: 60,
});

const manifestToText = (manifest: IntegrationManifest): string => JSON.stringify(manifest, null, 2);

export function IntegrationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<IntegrationDto[]>([]);
  const [manifestText, setManifestText] = useState(() => manifestToText(newManifest()));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    integrationsApi
      .list(token)
      .then((page) => {
        if (!alive) return;
        setItems(page.data);
        setMessage(null);
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar las integraciones.');
      });
    return () => {
      alive = false;
    };
  }, [token, version]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const parsed = IntegrationManifestSchema.parse(JSON.parse(manifestText));
      await integrationsApi.create(token, parsed);
      setMessage('Integración creada. Emite una API key para conectarla.');
      setManifestText(manifestToText(newManifest()));
      reload();
    } catch (err) {
      if (err instanceof SyntaxError) setMessage('El manifest no es JSON válido.');
      else if (err instanceof ApiError) setMessage(err.message);
      else if (typeof err === 'object' && err !== null && 'issues' in err) {
        setMessage('El manifest no cumple el esquema. Revisa los campos.');
      } else setMessage('No se pudo crear la integración.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Integraciones"
        description="Aplicaciones externas con identidad propia, scopes y API keys."
      />
      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      <BentoCard>
        <SectionHeader
          title="Nueva integración"
          description="Pega el manifest JSON con versión, scopes y alcance de clientes."
        />
        <form className="mt-4 grid gap-4" onSubmit={(event) => void create(event)}>
          <FormField label="Manifest" htmlFor="integration-manifest">
            <Textarea
              id="integration-manifest"
              rows={14}
              value={manifestText}
              onChange={(event) => setManifestText(event.target.value)}
              className="font-mono text-xs"
            />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? 'Creando…' : 'Crear integración'}
            </Button>
          </div>
        </form>
      </BentoCard>

      <div className="grid gap-4">
        {items.map((integration) => (
          <BentoCard key={integration.id} as="article" className="p-5 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid gap-1">
                <Link
                  className="text-lg font-bold text-fg hover:text-link hover:underline"
                  href={`/admin/integrations/${integration.id}`}
                >
                  {integration.name}
                </Link>
                <p className="text-sm text-fg-muted">
                  {integration.slug} · v{integration.manifestVersion} ·{' '}
                  {integration.activeCredentials} credencial(es) activa(s)
                </p>
                <p className="text-sm text-fg">
                  {integration.scopes.map((scope) => SCOPE_LABELS[scope]).join(' · ')}
                </p>
              </div>
              <StatusBadge kind="integration" value={integration.status} />
            </div>
          </BentoCard>
        ))}
        {items.length === 0 ? (
          <EmptyState
            icon={PlugIcon}
            title="Todavía no hay integraciones registradas."
            description="Crea una integración desde el manifest para emitir su primera API key."
          />
        ) : null}
      </div>
    </div>
  );
}
