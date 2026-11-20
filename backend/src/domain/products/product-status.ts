/** Estado del catálogo (app.product_status). Inactivo: no nuevas suscripciones (RN-01). */
export type ProductStatus = 'activo' | 'inactivo';

export const PRODUCT_STATUSES: readonly ProductStatus[] = ['activo', 'inactivo'] as const;

export function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value);
}
