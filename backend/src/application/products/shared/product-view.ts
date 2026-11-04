import type { ProductStatus } from '../../../domain/products/product-status.js';
import type { ProductType } from '../../../domain/products/product-type.js';

export interface ProductView {
  id: string;
  name: string;
  description: string | null;
  productType: ProductType;
  vendor: string | null;
  referenceCode: string | null;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}
