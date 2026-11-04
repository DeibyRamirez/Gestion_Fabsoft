/** Estado del catálogo (app.product_status). Inactivo: no nuevas suscripciones (RN-01). */
export type ProductStatus = 'active' | 'inactive';

export const PRODUCT_STATUSES: readonly ProductStatus[] = ['active', 'inactive'] as const;

export function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value);
}
