import { ActivateProduct } from '../../application/products/activate-product/use-case.js';
import { CreateProduct } from '../../application/products/create-product/use-case.js';
import { DeactivateProduct } from '../../application/products/deactivate-product/use-case.js';
import { GetProduct } from '../../application/products/get-product/use-case.js';
import { ListProducts } from '../../application/products/list-products/use-case.js';
import { UpdateProduct } from '../../application/products/update-product/use-case.js';
import type { Infra } from '../infra.js';

export function productsModule(infra: Infra) {
  const updateProduct = new UpdateProduct(infra.userUow);
  return {
    listProducts: new ListProducts(infra.userUow),
    getProduct: new GetProduct(infra.userUow),
    createProduct: new CreateProduct(infra.userUow),
    updateProduct,
    activateProduct: new ActivateProduct(infra.userUow),
    deactivateProduct: new DeactivateProduct(infra.userUow),
  };
}
