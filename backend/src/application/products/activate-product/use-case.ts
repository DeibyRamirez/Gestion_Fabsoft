import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { ProductView } from '../shared/product-view.js';
import type { UpdateProductRepos } from '../update-product/ports.js';

type ActivateProductUow = UpdateProductRepos & { audit: AuditWriter };

/** Activa un producto (`status=active`). */
export class ActivateProduct {
  constructor(private readonly uow: UnitOfWork<ActivateProductUow>) {}

  async execute(actor: UserActor, id: string): Promise<ProductView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ productUpdate, audit }) => {
      const current = await productUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Producto no encontrado');
      if (current.status === 'active') return current;
      const outcome = await productUpdate.save(id, { status: 'active', updatedBy: actor.userId });
      if (!outcome.ok) {
        throw new ApplicationError(
          'duplicate_product',
          'Ya existe un producto con ese nombre y proveedor',
        );
      }
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'product.updated',
        resourceType: 'product',
        resourceId: id,
        changes: { before: { status: current.status }, after: { status: 'active' } },
        requestId: actor.requestId,
      });
      return outcome.product;
    });
  }
}
