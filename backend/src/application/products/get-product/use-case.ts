import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { ProductView } from '../shared/product-view.js';
import type { GetProductRepos } from './ports.js';

export class GetProduct {
  constructor(private readonly uow: UnitOfWork<GetProductRepos>) {}

  async execute(actor: UserActor, id: string): Promise<ProductView> {
    requireRole(actor, 'admin', 'operator');
    const product = await this.uow.run(actor, ({ productDetail }) => productDetail.findById(id));
    if (!product) throw new ApplicationError('not_found', 'Producto no encontrado');
    return product;
  }
}
