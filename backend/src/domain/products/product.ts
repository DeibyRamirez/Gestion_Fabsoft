import type { ProductStatus } from './product-status.js';
import type { ProductType } from './product-type.js';

/** Entidad de catálogo sin precio ni ciclo (RN-02: congelados en la suscripción). */
export interface Product {
  id: string;
  name: string;
  description: string | null;
  productType: ProductType;
  vendor: string | null;
  referenceCode: string | null;
  status: ProductStatus;
}

/** Clave lógica del índice products_name_vendor_uq. */
export function productIdentityKey(name: string, vendor: string | null | undefined): string {
  return `${name.trim().toLowerCase()}|${(vendor ?? '').trim().toLowerCase()}`;
}
