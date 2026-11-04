import type { ProductView } from '../shared/product-view.js';

export interface GetProductQuery {
  findById(id: string): Promise<ProductView | null>;
}

export interface GetProductRepos {
  productDetail: GetProductQuery;
}
