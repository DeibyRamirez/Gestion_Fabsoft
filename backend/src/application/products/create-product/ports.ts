import type { ProductType } from '../../../domain/products/product-type.js';
import type { ProductView } from '../shared/product-view.js';

export interface NewProduct {
  name: string;
  description: string | null;
  productType: ProductType;
  vendor: string | null;
  referenceCode: string | null;
  createdBy: string;
}

export type CreateProductOutcome =
  | { ok: true; product: ProductView }
  | { ok: false; reason: 'duplicate_product' };

export interface CreateProductRepository {
  insert(input: NewProduct): Promise<CreateProductOutcome>;
}

export interface CreateProductRepos {
  productCreate: CreateProductRepository;
}
