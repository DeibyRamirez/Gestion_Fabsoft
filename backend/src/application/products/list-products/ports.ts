import type { ProductListQuery } from '@fabsoft/shared';
import type { ProductView } from '../shared/product-view.js';

export interface ListProductsQuery {
  list(query: ProductListQuery): Promise<{ items: ProductView[]; total: number }>;
}

export interface ListProductsRepos {
  productsList: ListProductsQuery;
}
