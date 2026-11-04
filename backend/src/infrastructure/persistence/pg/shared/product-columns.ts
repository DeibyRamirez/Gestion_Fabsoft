import type { ProductView } from '../../../../application/products/shared/product-view.js';
import type { ProductStatus } from '../../../../domain/products/product-status.js';
import type { ProductType } from '../../../../domain/products/product-type.js';

export const PRODUCT_COLUMNS = `id, name, description, product_type, vendor, reference_code, status,
  created_at, updated_at`;

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  product_type: ProductType;
  vendor: string | null;
  reference_code: string | null;
  status: ProductStatus;
  created_at: Date;
  updated_at: Date;
}

export const toProductView = (r: ProductRow): ProductView => ({
  id: r.id,
  name: r.name,
  description: r.description,
  productType: r.product_type,
  vendor: r.vendor,
  referenceCode: r.reference_code,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
