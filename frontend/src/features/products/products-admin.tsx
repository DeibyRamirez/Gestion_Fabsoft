'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ProductCreateSchema,
  ProductUpdateSchema,
  type ProductDto,
  type ProductPage,
  type ProductType,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { ConfirmDialog } from '@/shared/components/action-dialog';
import { PageHeader } from '@/shared/components/page-header';
import { PRODUCT_TYPE_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function ProductsAdmin() {
  const { token } = useAuth();
  const [page, setPage] = useState<ProductPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const [toDeactivate, setToDeactivate] = useState<ProductDto | null>(null);
  const [version, setVersion] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    apiFetch<ProductPage>('/products?pageSize=100&sort=name', { token })
      .then((result) => alive && setPage(result))
      .catch(() => alive && setMessage('No se pudo cargar el catálogo de productos.'));
    return () => {
      alive = false;
    };
  }, [token, version]);

  function startEdit(product: ProductDto) {
    setEditing(product);
    setMessage(null);
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditing(null);
    setMessage(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') ?? ''),
      productType: String(data.get('productType') ?? 'third_party') as ProductType,
      description: String(data.get('description') ?? '').trim() || null,
      vendor: String(data.get('vendor') ?? '').trim() || null,
      referenceCode: String(data.get('referenceCode') ?? '').trim() || null,
    };

    const parsed = editing
      ? ProductUpdateSchema.safeParse(payload)
      : ProductCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setPending(true);
    try {
      if (editing) {
        await apiFetch(`/products/${editing.id}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify(parsed.data),
        });
        setMessage('Producto actualizado.');
        setEditing(null);
      } else {
        await apiFetch('/products', {
          method: 'POST',
          token,
          body: JSON.stringify(parsed.data),
        });
        form.reset();
        setMessage('Producto creado. Ya está disponible para nuevas suscripciones.');
      }
      reload();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem?.code === 'duplicate_product'
          ? 'Ya existe un producto con ese nombre y proveedor.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo guardar el producto.',
      );
    } finally {
      setPending(false);
    }
  }

  function requestToggle(product: ProductDto) {
    if (product.status === 'activo') setToDeactivate(product);
    else void toggleStatus(product);
  }

  async function toggleStatus(product: ProductDto) {
    const next = product.status === 'activo' ? 'inactivo' : 'activo';
    try {
      await apiFetch(`/products/${product.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: next }),
      });
      setMessage(
        next === 'inactivo'
          ? 'Producto desactivado. No se ofrece para nuevas suscripciones; las existentes no cambian.'
          : 'Producto activado.',
      );
      reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <ConfirmDialog
        open={toDeactivate !== null}
        onOpenChange={(o) => {
          if (!o) setToDeactivate(null);
        }}
        title="Desactivar producto"
        description={
          toDeactivate
            ? `¿Desactivar "${toDeactivate.name}"? No se ofrecerá para nuevas suscripciones; las existentes no cambian.`
            : ''
        }
        confirmLabel="Desactivar"
        destructive
        onConfirm={() => {
          if (toDeactivate) void toggleStatus(toDeactivate);
        }}
      />
      <PageHeader
        title="Productos"
        description="Catálogo sin precio ni periodicidad; ambos se definen en cada suscripción."
      />

      {message ? (
        <div
          role="status"
          className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg"
        >
          {message}
        </div>
      ) : null}

      <div ref={formRef}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </CardTitle>
            <CardDescription>
              El catálogo no guarda precio ni periodicidad. Esos valores se capturan y congelan en
              la suscripción.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              key={editing?.id ?? 'new'}
              onSubmit={submit}
              className="grid gap-4 md:grid-cols-2"
            >
              <div className="grid gap-2">
                <Label htmlFor="product-name">Nombre</Label>
                <Input id="product-name" name="name" defaultValue={editing?.name ?? ''} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-type">Tipo</Label>
                <select
                  id="product-type"
                  name="productType"
                  defaultValue={editing?.productType ?? 'third_party'}
                  className={nativeSelectClassName}
                >
                  {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-vendor">Proveedor</Label>
                <Input id="product-vendor" name="vendor" defaultValue={editing?.vendor ?? ''} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-referenceCode">Referencia</Label>
                <Input
                  id="product-referenceCode"
                  name="referenceCode"
                  defaultValue={editing?.referenceCode ?? ''}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="product-description">Descripción</Label>
                <Input
                  id="product-description"
                  name="description"
                  defaultValue={editing?.description ?? ''}
                />
              </div>
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <Button type="submit" disabled={pending}>
                  {editing ? 'Guardar cambios' : 'Crear producto'}
                </Button>
                {editing ? (
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    Cancelar edición
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Productos registrados</CardTitle>
          <CardDescription>
            Desactivar un producto no modifica las suscripciones existentes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {page === null ? (
            <p role="status" aria-busy="true" className="text-sm text-fg-muted">
              Cargando productos…
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-fg-muted">
                      No hay productos en el catálogo.
                    </TableCell>
                  </TableRow>
                ) : (
                  page.data.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{PRODUCT_TYPE_LABELS[product.productType]}</TableCell>
                      <TableCell>{product.vendor ?? '—'}</TableCell>
                      <TableCell>{product.referenceCode ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge kind="product" value={product.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(product)}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant={product.status === 'activo' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => requestToggle(product)}
                          >
                            {product.status === 'activo' ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
