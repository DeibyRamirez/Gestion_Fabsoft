/** Tipos de catálogo (app.product_type, docs/data-model.md). */
export type ProductType = 'third_party' | 'own' | 'recurring_service';

export const PRODUCT_TYPES: readonly ProductType[] = [
  'third_party',
  'own',
  'recurring_service',
] as const;

export function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}
