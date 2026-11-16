'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  SubscriptionCreateSchema,
  type ClientDto,
  type ClientPage,
  type ProductDto,
  type ProductPage,
  type SubscriptionDetailDto,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

type Props = {
  token: string | null;
  onCreated?: (subscription: SubscriptionDetailDto) => void;
};

export function SubscriptionForm({ token, onCreated }: Props) {
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<ClientPage>('/clients?pageSize=100&status=active', { token }),
      apiFetch<ProductPage>('/products?pageSize=100&status=active', { token }),
    ])
      .then(([clientPage, productPage]) => {
        if (!alive) return;
        setClients(clientPage.data.filter((c) => c.status === 'active'));
        setProducts(productPage.data.filter((p) => p.status === 'active'));
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar clientes o productos.');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const rawPrice = String(data.get('priceAmount') ?? '').trim();
    const parsed = SubscriptionCreateSchema.safeParse({
      clientId: String(data.get('clientId') ?? ''),
      productId: String(data.get('productId') ?? ''),
      startDate: String(data.get('startDate') ?? ''),
      billingCycle: String(data.get('billingCycle') ?? 'monthly'),
      ...(billingCycle === 'custom'
        ? { customCycleMonths: Number(data.get('customCycleMonths')) }
        : {}),
      priceAmount: rawPrice === '' ? '' : Number(rawPrice).toFixed(2),
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
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      {message ? (
        <p role="status" className="md:col-span-2 text-sm">
          {message}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="clientId">Cliente activo</Label>
        <select id="clientId" name="clientId" required className={selectClassName}>
          <option value="">Seleccione…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legalName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="productId">Producto activo</Label>
        <select id="productId" name="productId" required className={selectClassName}>
          <option value="">Seleccione…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="startDate">Fecha de inicio</Label>
        <Input id="startDate" name="startDate" type="date" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="billingCycle">Periodicidad</Label>
        <select
          id="billingCycle"
          name="billingCycle"
          value={billingCycle}
          onChange={(e) => setBillingCycle(e.target.value)}
          className={selectClassName}
        >
          <option value="monthly">Mensual</option>
          <option value="quarterly">Trimestral</option>
          <option value="semiannual">Semestral</option>
          <option value="annual">Anual</option>
          <option value="biennial">Bienal</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>
      {billingCycle === 'custom' ? (
        <div className="grid gap-2">
          <Label htmlFor="customCycleMonths">Meses (1–120)</Label>
          <Input
            id="customCycleMonths"
            name="customCycleMonths"
            type="number"
            min={1}
            max={120}
            required
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="priceAmount">Precio (COP)</Label>
        <Input id="priceAmount" name="priceAmount" type="number" min={0} step="0.01" required />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          Crear suscripción
        </Button>
      </div>
    </form>
  );
}
