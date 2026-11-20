'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  SubscriptionCreateSchema,
  type ClientDto,
  type ClientOwnerCandidate,
  type ClientOwnerCandidateList,
  type ClientPage,
  type ProductDto,
  type ProductPage,
  type SubscriptionDetailDto,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { FormField } from '@/shared/components/form-field';
import { FormActions, FormGrid } from '@/shared/components/form-layout';
import { BILLING_CYCLE_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';

type Props = {
  token: string | null;
  isAdmin?: boolean;
  onCreated?: (subscription: SubscriptionDetailDto) => void;
};

const BILLING_CYCLES = Object.entries(BILLING_CYCLE_LABELS) as [
  keyof typeof BILLING_CYCLE_LABELS,
  string,
][];

export function SubscriptionForm({ token, isAdmin = false, onCreated }: Props) {
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [owners, setOwners] = useState<ClientOwnerCandidate[]>([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<ClientPage>('/clients?pageSize=100&status=activo', { token }),
      apiFetch<ProductPage>('/products?pageSize=100&status=activo', { token }),
      apiFetch<ClientOwnerCandidateList>('/clients/assignable-owners', { token }),
    ])
      .then(([clientPage, productPage, ownerList]) => {
        if (!alive) return;
        setClients(clientPage.data.filter((c) => c.status === 'activo'));
        setProducts(productPage.data.filter((p) => p.status === 'activo'));
        setOwners(ownerList.data);
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar clientes, productos o responsables.');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const rawPrice = String(data.get('priceAmount') ?? '').trim();
    const rawSupplierCost = String(data.get('supplierCostAmount') ?? '').trim();
    const parsed = SubscriptionCreateSchema.safeParse({
      clientId: String(data.get('clientId') ?? ''),
      productId: String(data.get('productId') ?? ''),
      startDate: String(data.get('startDate') ?? ''),
      billingCycle: String(data.get('billingCycle') ?? 'monthly'),
      ...(billingCycle === 'custom'
        ? { customCycleMonths: Number(data.get('customCycleMonths')) }
        : {}),
      priceAmount: rawPrice === '' ? '' : Number(rawPrice).toFixed(2),
      contractReference: String(data.get('contractReference') ?? '').trim() || null,
      renewalTerms: String(data.get('renewalTerms') ?? '').trim() || null,
      ownerUserId: String(data.get('ownerUserId') ?? '').trim() || null,
      notes: String(data.get('notes') ?? '').trim() || null,
      isRenewable: data.get('isRenewable') === 'on',
      visibleInPortal: data.get('visibleInPortal') === 'on',
      ...(isAdmin && rawSupplierCost !== ''
        ? { supplierCostAmount: Number(rawSupplierCost).toFixed(2) }
        : {}),
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setPending(true);
    try {
      const key =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Date.now());
      const created = await apiFetch<SubscriptionDetailDto>('/subscriptions', {
        method: 'POST',
        token,
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(parsed.data),
      });
      onCreated?.(created);
      setMessage('Suscripción creada.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo crear la suscripción.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {message ? (
        <p role="status" className="mb-4 text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      <FormGrid>
        <FormField label="Cliente activo" htmlFor="clientId">
          <select id="clientId" name="clientId" required className={nativeSelectClassName}>
            <option value="">Seleccione…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Producto activo" htmlFor="productId">
          <select id="productId" name="productId" required className={nativeSelectClassName}>
            <option value="">Seleccione…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Fecha de inicio" htmlFor="startDate">
          <Input id="startDate" name="startDate" type="date" required />
        </FormField>
        <FormField label="Periodicidad" htmlFor="billingCycle">
          <select
            id="billingCycle"
            name="billingCycle"
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
            className={nativeSelectClassName}
          >
            {BILLING_CYCLES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        {billingCycle === 'custom' ? (
          <FormField label="Meses (1–120)" htmlFor="customCycleMonths">
            <Input
              id="customCycleMonths"
              name="customCycleMonths"
              type="number"
              min={1}
              max={120}
              required
            />
          </FormField>
        ) : null}
        <FormField label="Precio (COP)" htmlFor="priceAmount">
          <Input id="priceAmount" name="priceAmount" type="number" min={0} step="0.01" required />
        </FormField>
        {isAdmin ? (
          <FormField label="Costo proveedor (COP)" htmlFor="supplierCostAmount">
            <Input
              id="supplierCostAmount"
              name="supplierCostAmount"
              type="number"
              min={0}
              step="0.01"
            />
          </FormField>
        ) : null}
        <FormField label="Referencia contractual" htmlFor="contractReference">
          <Input id="contractReference" name="contractReference" maxLength={120} />
        </FormField>
        <FormField label="Responsable interno" htmlFor="ownerUserId">
          <select
            id="ownerUserId"
            name="ownerUserId"
            defaultValue=""
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
        <FormField
          label="Condiciones de renovación"
          htmlFor="renewalTerms"
          className="md:col-span-2"
        >
          <Textarea id="renewalTerms" name="renewalTerms" rows={3} maxLength={2000} />
        </FormField>
        <FormField label="Notas internas" htmlFor="notes" className="md:col-span-2">
          <Textarea id="notes" name="notes" rows={3} maxLength={5000} />
        </FormField>
        <div className="flex flex-wrap items-center gap-6 md:col-span-2">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              name="isRenewable"
              defaultChecked
              className="size-4 rounded border-border-input accent-[var(--color-iris)]"
            />
            Renovable
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              name="visibleInPortal"
              defaultChecked
              className="size-4 rounded border-border-input accent-[var(--color-iris)]"
            />
            Visible en el portal del cliente
          </label>
        </div>
      </FormGrid>
      <FormActions className="mt-5">
        <Button type="submit" disabled={pending}>
          Crear suscripción
        </Button>
      </FormActions>
    </form>
  );
}
