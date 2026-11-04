import type { ProductCreateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { ProductView } from '../shared/product-view.js';
import type { CreateProductRepos } from './ports.js';

type CreateProductUow = CreateProductRepos & { audit: AuditWriter };

/** Alta de producto en catálogo (sin precio ni ciclo). */
export class CreateProduct {
  constructor(private readonly uow: UnitOfWork<CreateProductUow>) {}

  async execute(actor: UserActor, input: ProductCreateInput): Promise<ProductView> {
    requireRole(actor, 'admin');
    const outcome = await this.uow.run(actor, async ({ productCreate, audit }) => {
      const res = await productCreate.insert({
        name: input.name,
        description: input.description ?? null,
        productType: input.productType,
        vendor: input.vendor ?? null,
        referenceCode: input.referenceCode ?? null,
        createdBy: actor.userId,
      });
      if (res.ok) {
        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'product.created',
          resourceType: 'product',
          resourceId: res.product.id,
          changes: {
            after: {
              name: res.product.name,
              productType: res.product.productType,
              status: res.product.status,
            },
          },
          requestId: actor.requestId,
        });
      }
      return res;
    });
    if (!outcome.ok) {
      throw new ApplicationError(
        'duplicate_product',
        'Ya existe un producto con ese nombre y proveedor',
      );
    }
    return outcome.product;
  }
}
