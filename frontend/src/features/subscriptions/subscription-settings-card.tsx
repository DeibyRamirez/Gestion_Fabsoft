'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type {
  ClientOwnerCandidate,
  ClientOwnerCandidateList,
  SubscriptionDetailDto,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { BentoCard } from '@/shared/components/bento';
import { FormField } from '@/shared/components/form-field';
import { FormGrid } from '@/shared/components/form-layout';
import { SectionHeader } from '@/shared/components/section-header';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';

export function SubscriptionSettingsCard({
  subscription,
  token,
  isAdmin,
  onSaved,
  className,
}: {
  subscription: SubscriptionDetailDto;
  token: string | null;
  isAdmin: boolean;
  onSaved: () => void;
  className?: string;
}) {
  const [owners, setOwners] = useState<ClientOwnerCandidate[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<ClientOwnerCandidateList>('/clients/assignable-owners', { token })
      .then((result) => {
        if (alive) setOwners(result.data);
      })
      .catch(() => {
        if (alive) setOwners([]);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const rawSupplier = String(data.get('supplierCostAmount') ?? '').trim();
    const supplierCost = rawSupplier === '' ? null : Number(rawSupplier).toFixed(2);
    const currentSupplier = subscription.supplierCostAmount ?? null;
    const supplierChanged = isAdmin && supplierCost !== currentSupplier;
    const changeReason = String(data.get('changeReason') ?? '').trim();

    if (supplierChanged && !changeReason) {
      setMessage('Indica el motivo del cambio de costo.');
      return;
    }

    const payload = {
      version: subscription.version,
      ownerUserId: String(data.get('ownerUserId') ?? '').trim() || null,
      renewalTerms: String(data.get('renewalTerms') ?? '').trim() || null,
      notes: String(data.get('notes') ?? '').trim() || null,
      isRenewable: data.get('isRenewable') === 'on',
      visibleInPortal: data.get('visibleInPortal') === 'on',
      ...(supplierChanged ? { supplierCostAmount: supplierCost, changeReason } : {}),
    };

    setPending(true);
    try {
      await apiFetch(`/subscriptions/${subscription.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      });
      setMessage('Configuración guardada.');
      onSaved();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      setPending(false);
    }
  }

  return (
    <BentoCard {...(className ? { className } : {})}>
      <SectionHeader
        title="Configuración"
        description="Responsable, condiciones, visibilidad y notas internas."
      />
      <form onSubmit={submit} className="mt-4">
        {message ? (
          <p role="status" className="mb-4 text-sm text-fg-muted">
            {message}
          </p>
        ) : null}
        <FormGrid>
          <FormField label="Responsable interno" htmlFor="subscription-owner">
            <select
              id="subscription-owner"
              name="ownerUserId"
              defaultValue={subscription.owner?.id ?? ''}
              className={nativeSelectClassName}
            >
              <option value="">Sin responsable</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.fullName}
                </option>
              ))}
            </select>
          </FormField>
          {isAdmin ? (
            <FormField label="Costo proveedor (COP)" htmlFor="subscription-supplier-cost">
              <Input
                id="subscription-supplier-cost"
                name="supplierCostAmount"
                type="number"
                min={0}
                step="0.01"
                defaultValue={subscription.supplierCostAmount ?? ''}
              />
            </FormField>
          ) : null}
          <FormField
            label="Condiciones de renovación"
            htmlFor="subscription-renewal-terms"
            className="md:col-span-2"
          >
            <Textarea
              id="subscription-renewal-terms"
              name="renewalTerms"
              rows={3}
              maxLength={2000}
              defaultValue={subscription.renewalTerms ?? ''}
            />
          </FormField>
          <FormField label="Notas internas" htmlFor="subscription-notes" className="md:col-span-2">
            <Textarea
              id="subscription-notes"
              name="notes"
              rows={3}
              maxLength={5000}
              defaultValue={subscription.notes ?? ''}
            />
          </FormField>
          {isAdmin ? (
            <FormField
              label="Motivo del cambio de costo"
              htmlFor="subscription-change-reason"
              className="md:col-span-2"
              hint="Obligatorio solo si cambias el costo del proveedor."
            >
              <Input id="subscription-change-reason" name="changeReason" maxLength={1000} />
            </FormField>
          ) : null}
          <div className="flex flex-wrap items-center gap-6 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                name="isRenewable"
                defaultChecked={subscription.isRenewable}
                className="size-4 rounded border-border-input accent-[var(--color-iris)]"
              />
              Renovable
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                name="visibleInPortal"
                defaultChecked={subscription.visibleInPortal}
                className="size-4 rounded border-border-input accent-[var(--color-iris)]"
              />
              Visible en el portal del cliente
            </label>
          </div>
        </FormGrid>
        <div className="mt-5 flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            Guardar configuración
          </Button>
        </div>
      </form>
    </BentoCard>
  );
}
