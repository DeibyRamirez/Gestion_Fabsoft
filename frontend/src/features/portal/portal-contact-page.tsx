'use client';

import { useEffect, useState } from 'react';
import { MessageCircleIcon } from 'lucide-react';
import type { PortalMe } from '@fabsoft/shared';
import { useAuth } from '@/features/auth/auth-provider';
import { BentoCard } from '@/shared/components/bento';
import { DetailList } from '@/shared/components/detail-list';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import { SectionHeader } from '@/shared/components/section-header';
import { portalApi } from './api';

export function PortalContactPage() {
  const { token } = useAuth();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    portalApi
      .me(token)
      .then((profile) => {
        if (!alive) return;
        setMe(profile);
        setMessage(null);
      })
      .catch(() => {
        if (alive) setMessage('No se pudo cargar el canal de contacto.');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Contacto"
        description="Canales de atención de FabSoft para resolver dudas sobre tus suscripciones."
      />
      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      {!me ? (
        <LoadingState label="Cargando canal de contacto…" />
      ) : (
        <BentoCard>
          <SectionHeader
            title={me.organization.legalName}
            description="Estamos disponibles para ayudarte con tus licencias y renovaciones."
            action={
              <span className="grid size-10 place-items-center rounded-2xl bg-iris-soft text-iris">
                <MessageCircleIcon aria-hidden className="size-5" />
              </span>
            }
          />
          <DetailList
            className="mt-4"
            columns={2}
            items={[
              {
                label: 'Correo',
                value: me.contactChannel.email ? (
                  <a className="text-link underline" href={`mailto:${me.contactChannel.email}`}>
                    {me.contactChannel.email}
                  </a>
                ) : (
                  '—'
                ),
              },
              {
                label: 'Teléfono',
                value: <span className="font-mono">{me.contactChannel.phone ?? '—'}</span>,
              },
              {
                label: 'Horario',
                value: me.contactChannel.hours ?? '—',
                className: 'sm:col-span-2',
              },
            ]}
          />
        </BentoCard>
      )}
    </div>
  );
}
