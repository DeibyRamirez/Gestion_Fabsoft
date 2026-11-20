'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRightIcon, BellRingIcon, MessageCircleIcon } from 'lucide-react';
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '@fabsoft/shared';
import { useAuth } from '@/features/auth/auth-provider';
import { ApiError, apiFetch } from '@/shared/api/client';
import { BentoCard } from '@/shared/components/bento';
import { FormField } from '@/shared/components/form-field';
import { FormActions, FormGrid } from '@/shared/components/form-layout';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import { SectionHeader } from '@/shared/components/section-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';

const toNullable = (value: string | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const cloneSettings = (settings: Settings): Settings => ({
  contactChannel: { ...settings.contactChannel },
});

type Message = { tone: 'ok' | 'error'; text: string };

export function SettingsPage() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<Settings>(cloneSettings(DEFAULT_SETTINGS));
  const [saved, setSaved] = useState<Settings>(cloneSettings(DEFAULT_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<Settings>('/settings', { token })
      .then((result) => {
        if (!alive) return;
        setSettings(cloneSettings(result));
        setSaved(cloneSettings(result));
        setMessage(null);
      })
      .catch(() => {
        if (alive) setMessage({ tone: 'error', text: 'No se pudo cargar la configuración.' });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  function update(patch: Partial<Settings['contactChannel']>) {
    setSettings((current) => ({
      contactChannel: { ...current.contactChannel, ...patch },
    }));
  }

  async function save() {
    const parsed = SettingsSchema.safeParse({
      contactChannel: {
        email: toNullable(settings.contactChannel.email),
        phone: toNullable(settings.contactChannel.phone),
        hours: toNullable(settings.contactChannel.hours),
      },
    });
    if (!parsed.success) {
      setMessage({ tone: 'error', text: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const updated = await apiFetch<Settings>('/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify(parsed.data),
      });
      setSettings(cloneSettings(updated));
      setSaved(cloneSettings(updated));
      setMessage({
        tone: 'ok',
        text: 'Configuración guardada. El portal del cliente ya muestra estos datos.',
      });
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'No se pudo guardar la configuración.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Configuración"
        description="Datos generales que el equipo y el portal del cliente usan a diario."
      />

      {message ? (
        <div
          role="status"
          className={cn(
            'rounded-md border px-4 py-3 text-sm',
            message.tone === 'error'
              ? 'border-danger/30 bg-danger/5 text-danger'
              : 'border-border bg-surface text-fg',
          )}
        >
          {message.text}
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Cargando configuración…" />
      ) : (
        <>
          <BentoCard>
            <SectionHeader
              title="Canal de contacto del portal"
              description="Se muestra a los usuarios de cliente en /portal/contact para que sepan cómo escribirte."
              action={
                <span className="grid size-10 place-items-center rounded-2xl bg-iris-soft text-iris">
                  <MessageCircleIcon aria-hidden className="size-5" />
                </span>
              }
            />
            <form
              className="mt-5 grid gap-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <FormGrid>
                <FormField
                  label="Correo de contacto"
                  htmlFor="settings-email"
                  hint="Opcional. Debe ser un correo válido."
                >
                  <Input
                    id="settings-email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={settings.contactChannel.email ?? ''}
                    onChange={(event) => update({ email: event.target.value })}
                  />
                </FormField>

                <FormField label="Teléfono" htmlFor="settings-phone" hint="Opcional.">
                  <Input
                    id="settings-phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    value={settings.contactChannel.phone ?? ''}
                    onChange={(event) => update({ phone: event.target.value })}
                  />
                </FormField>

                <FormField
                  label="Horario de atención"
                  htmlFor="settings-hours"
                  hint="Opcional. Por ejemplo: lunes a viernes, 8:00-17:00 (hora Colombia)."
                  className="md:col-span-2"
                >
                  <Input
                    id="settings-hours"
                    maxLength={200}
                    value={settings.contactChannel.hours ?? ''}
                    onChange={(event) => update({ hours: event.target.value })}
                  />
                </FormField>
              </FormGrid>

              <FormActions>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setSettings(cloneSettings(saved));
                    setMessage(null);
                  }}
                >
                  Descartar cambios
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Guardando…' : 'Guardar configuración'}
                </Button>
              </FormActions>
            </form>
          </BentoCard>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alertas y correo</CardTitle>
              <CardDescription>
                Los umbrales de vencimiento, los canales y la plantilla de correo se editan en
                Reglas de alerta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/admin/alert-rules">
                  <BellRingIcon aria-hidden />
                  Abrir reglas de alerta
                  <ArrowUpRightIcon aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
