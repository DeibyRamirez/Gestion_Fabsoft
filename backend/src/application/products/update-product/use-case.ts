import type { ProductUpdateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditAction, AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { ProductView } from '../shared/product-view.js';
import type { UpdateProductRepos } from './ports.js';

type UpdateProductUow = UpdateProductRepos & { audit: AuditWriter };

/** Actualiza campos del catálogo, incluido status (activar/inactivar). */
export class UpdateProduct {
  constructor(private readonly uow: UnitOfWork<UpdateProductUow>) {}

  async execute(actor: UserActor, id: string, input: ProductUpdateInput): Promise<ProductView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ productUpdate, audit }) => {
      const current = await productUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Producto no encontrado');
      const outcome = await productUpdate.save(id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.productType !== undefined ? { productType: input.productType } : {}),
        ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
        ...(input.referenceCode !== undefined ? { referenceCode: input.referenceCode } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedBy: actor.userId,
      });
      if (!outcome.ok) {
        throw new ApplicationError(
          'duplicate_product',
          'Ya existe un producto con ese nombre y proveedor',
        );
      }
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: auditAction(current, outcome.product),
        resourceType: 'product',
        resourceId: id,
        changes: { before: snapshot(current), after: snapshot(outcome.product) },
        requestId: actor.requestId,
      });
      return outcome.product;
    });
  }
}

function auditAction(before: ProductView, after: ProductView): AuditAction {
  if (after.status === 'inactive' && before.status !== 'inactive') return 'product.deactivated';
  return 'product.updated';
}

const snapshot = (p: ProductView) => ({
  name: p.name,
  productType: p.productType,
  vendor: p.vendor,
  status: p.status,
});
