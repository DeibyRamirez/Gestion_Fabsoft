import type { ProductListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { ProductView } from '../shared/product-view.js';
import type { ListProductsRepos } from './ports.js';

export interface ProductListResult {
  items: ProductView[];
  page: number;
  pageSize: number;
  total: number;
}

export class ListProducts {
  constructor(private readonly uow: UnitOfWork<ListProductsRepos>) {}

  async execute(actor: UserActor, query: ProductListQuery): Promise<ProductListResult> {
    requireRole(actor, 'admin', 'operator');
    const { items, total } = await this.uow.run(actor, ({ productsList }) =>
      productsList.list(query),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
