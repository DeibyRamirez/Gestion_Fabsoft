'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeftIcon, PlugIcon } from 'lucide-react';
import {
  IntegrationManifestSchema,
  type ApiCredentialDto,
  type IntegrationDto,
  type IntegrationStatus,
} from '@fabsoft/shared';
import { ApiError } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { ConfirmDialog } from '@/shared/components/action-dialog';
import { BentoCard } from '@/shared/components/bento';
import { DetailHero } from '@/shared/components/detail-hero';
import { FormField } from '@/shared/components/form-field';
import { FormGrid } from '@/shared/components/form-layout';
import { LoadingState } from '@/shared/components/loading-state';
import { OneTimeSecret } from '@/shared/components/one-time-secret';
import { SectionHeader } from '@/shared/components/section-header';
import { formatDateTime } from '@/shared/lib/format';
import { SCOPE_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge, ToneBadge } from '@/shared/ui/status-badge';
import { Textarea } from '@/shared/ui/textarea';
import { integrationsApi } from './api';

const manifestToText = (integration: IntegrationDto): string =>
  JSON.stringify(integration.manifest, null, 2);

export function IntegrationDetail({ integrationId }: { integrationId: string }) {
  const { token } = useAuth();
  const [integration, setIntegration] = useState<IntegrationDto | null>(null);
  const [credentials, setCredentials] = useState<ApiCredentialDto[]>([]);
  const [manifestText, setManifestText] = useState('');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toRevoke, setToRevoke] = useState<ApiCredentialDto | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      integrationsApi.get(token, integrationId),
      integrationsApi.credentials(token, integrationId),
    ])
      .then(([detail, credentialPage]) => {
        if (!alive) return;
        setIntegration(detail);
        setManifestText(manifestToText(detail));
        setCredentials(credentialPage.data);
      })
      .catch(() => {
        if (alive) setMessage('Integración no encontrada.');
      });
    return () => {
      alive = false;
    };
  }, [token, integrationId, version]);

  function report(error: unknown, fallback: string) {
    if (error instanceof SyntaxError) setMessage('El manifest no es JSON válido.');
    else if (error instanceof ApiError) setMessage(error.message);
    else setMessage(fallback);
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await integrationsApi.update(token, integrationId, {
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? '') || null,
        status: String(form.get('status') ?? 'activa') as IntegrationStatus,
      });
      setMessage('Integración actualizada.');
      reload();
    } catch (error) {
      report(error, 'No se pudo actualizar la integración.');
    } finally {
      setBusy(false);
    }
  }

  async function saveManifest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const manifest = IntegrationManifestSchema.parse(JSON.parse(manifestText));
      await integrationsApi.replaceManifest(token, integrationId, manifest);
      setMessage('Manifest actualizado.');
      reload();
    } catch (error) {
      report(error, 'No se pudo actualizar el manifest.');
    } finally {
      setBusy(false);
    }
  }

  async function createCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await integrationsApi.createCredential(token, integrationId, {
        label: label.trim() || null,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : undefined,
      });
      setSecret(created.apiKey);
      setLabel('');
      setExpiresAt('');
      setMessage('Credencial creada. Copia la API key ahora: no se volverá a mostrar.');
      reload();
    } catch (error) {
      report(error, 'No se pudo crear la credencial.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeCredential(credentialId: string) {
    setBusy(true);
    try {
      await integrationsApi.revokeCredential(token, integrationId, credentialId);
      setMessage('Credencial revocada.');
      reload();
    } catch (error) {
      report(error, 'No se pudo revocar la credencial.');
    } finally {
      setBusy(false);
    }
  }

  if (!integration) {
    return message ? (
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
    ) : (
      <LoadingState label="Cargando integración…" />
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setToRevoke(null);
        }}
        title="Revocar API key"
        description={
          toRevoke
            ? `¿Revocar la credencial ${toRevoke.keyPrefix}…? La integración dejará de autenticarse con ella.`
            : ''
        }
        confirmLabel="Revocar"
        destructive
        onConfirm={() => {
          if (toRevoke) void revokeCredential(toRevoke.id);
        }}
      />

      <DetailHero
        tone="light"
        title={integration.name}
        icon={PlugIcon}
        badge={<StatusBadge kind="integration" value={integration.status} />}
        meta={
          <span className="font-mono">
            {integration.slug} · manifest v{integration.manifestVersion}
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/integrations">
              <ArrowLeftIcon aria-hidden />
              Volver a integraciones
            </Link>
          </Button>
        }
      />

      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      {secret ? (
        <OneTimeSecret
          value={secret}
          title="API key creada"
          description="Esta clave se muestra una sola vez. Guárdala en el gestor de secretos de la integración."
        />
      ) : null}

      <BentoCard>
        <SectionHeader title="Datos" />
        <form className="mt-4" onSubmit={(event) => void saveMetadata(event)}>
          <FormGrid>
            <FormField label="Nombre" htmlFor="integration-name" className="md:col-span-2">
              <Input id="integration-name" name="name" defaultValue={integration.name} required />
            </FormField>
            <FormField
              label="Descripción"
              htmlFor="integration-description"
              className="md:col-span-2"
            >
              <Textarea
                id="integration-description"
                name="description"
                defaultValue={integration.description ?? ''}
                rows={3}
              />
            </FormField>
            <FormField label="Estado" htmlFor="integration-status">
              <select
                id="integration-status"
                name="status"
                defaultValue={integration.status}
                className={nativeSelectClassName}
              >
                <option value="activa">Activa</option>
                <option value="deshabilitada">Deshabilitada</option>
              </select>
            </FormField>
          </FormGrid>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={busy}>
              Guardar datos
            </Button>
          </div>
        </form>
      </BentoCard>

      <BentoCard>
        <SectionHeader title="Permisos y manifest" />
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge kind="integration" value={integration.status} />
          <span className="text-fg-muted">
            Alcance:{' '}
            {integration.clientScope === 'all' ? 'Todos los clientes' : 'Clientes asignados'}
          </span>
          <span className="text-fg-muted">Límite: {integration.rateLimitPerMinute}/min</span>
        </div>
        <p className="mt-2 text-sm text-fg">
          Scopes: {integration.scopes.map((scope) => SCOPE_LABELS[scope]).join(' · ')}
        </p>
        {integration.clientIds.length > 0 ? (
          <p className="mt-1 font-mono text-xs text-fg-muted">
            Clientes: {integration.clientIds.join(', ')}
          </p>
        ) : null}
        <form className="mt-4 grid gap-3" onSubmit={(event) => void saveManifest(event)}>
          <FormField label="Manifest JSON" htmlFor="manifest-editor">
            <Textarea
              id="manifest-editor"
              rows={16}
              value={manifestText}
              onChange={(event) => setManifestText(event.target.value)}
              className="font-mono text-xs"
            />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              Guardar manifest
            </Button>
          </div>
        </form>
      </BentoCard>

      <BentoCard>
        <SectionHeader
          title="Credenciales"
          description="Emite y revoca API keys de la integración."
        />
        <form
          className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]"
          onSubmit={(event) => void createCredential(event)}
        >
          <FormField label="Etiqueta" htmlFor="credential-label">
            <Input
              id="credential-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Principal, rotación 2027…"
            />
          </FormField>
          <FormField label="Caduca" htmlFor="credential-expires">
            <Input
              id="credential-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </FormField>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              Emitir API key
            </Button>
          </div>
        </form>

        <div className="mt-4 grid gap-2">
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-3 text-sm"
            >
              <div className="grid gap-0.5">
                <code className="font-mono text-xs text-fg">{credential.keyPrefix}…</code>
                <span className="text-xs text-fg-muted">
                  {credential.label ?? 'Sin etiqueta'} · creada{' '}
                  {formatDateTime(credential.createdAt)}
                  {credential.expiresAt ? ` · caduca ${formatDateTime(credential.expiresAt)}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {credential.revokedAt ? (
                  <ToneBadge tone="muted">Revocada</ToneBadge>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setToRevoke(credential)}
                  >
                    Revocar
                  </Button>
                )}
              </div>
            </div>
          ))}
          {credentials.length === 0 ? (
            <p className="text-sm text-fg-muted">Todavía no hay credenciales.</p>
          ) : null}
        </div>
      </BentoCard>
    </div>
  );
}
