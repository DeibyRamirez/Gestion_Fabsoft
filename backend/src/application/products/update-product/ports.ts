import type { ProductStatus } from '../../../domain/products/product-status.js';
import type { ProductType } from '../../../domain/products/product-type.js';
import type { ProductView } from '../shared/product-view.js';

export interface ProductPatch {
  name?: string;
  description?: string | null;
  productType?: ProductType;
  vendor?: string | null;
  referenceCode?: string | null;
  status?: ProductStatus;
  updatedBy: string;
}

export type UpdateProductOutcome =
  { ok: true; product: ProductView } | { ok: false; reason: 'duplicate_product' };

export interface UpdateProductRepository {
  loadForUpdate(id: string): Promise<ProductView | null>;
  save(id: string, patch: ProductPatch): Promise<UpdateProductOutcome>;
}

export interface UpdateProductRepos {
  productUpdate: UpdateProductRepository;
}
