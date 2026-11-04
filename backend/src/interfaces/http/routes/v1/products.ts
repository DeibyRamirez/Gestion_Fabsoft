import {
  ProductCreateSchema,
  ProductListQuerySchema,
  ProductUpdateSchema,
  type ProductDto,
  type ProductPage,
} from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { CreateProduct } from '../../../../application/products/create-product/use-case.js';
import type { GetProduct } from '../../../../application/products/get-product/use-case.js';
import type { ListProducts } from '../../../../application/products/list-products/use-case.js';
import type { ProductView } from '../../../../application/products/shared/product-view.js';
import type { UpdateProduct } from '../../../../application/products/update-product/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface ProductsRouteDeps {
  listProducts: ListProducts;
  getProduct: GetProduct;
  createProduct: CreateProduct;
  updateProduct: UpdateProduct;
}

const IdSchema = z.string().uuid();

export const toProductDto = (p: ProductView): ProductDto => ({
  id: p.id,
  name: p.name,
  description: p.description,
  productType: p.productType,
  vendor: p.vendor,
  referenceCode: p.referenceCode,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

/** /products: lectura admin+operator; escritura sólo admin (permissions-matrix). */
export function productsRouter(
  deps: ProductsRouteDeps,
  guards: RequestHandler[],
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  const readGuards = [...guards, requireRole('admin', 'operator')];
  const writeGuards = [...guards, requireRole('admin')];

  router.get('/products', ...readGuards, async (req, res) => {
    const query = ProductListQuerySchema.parse(req.query);
    const r = await deps.listProducts.execute(actorOf(res), query);
    const body: ProductPage = {
      data: r.items.map(toProductDto),
      meta: {
        page: r.page,
        pageSize: r.pageSize,
        total: r.total,
        totalPages: Math.ceil(r.total / r.pageSize),
      },
    };
    res.json(body);
  });

  router.post('/products', ...writeGuards, createIdempotency, async (req, res) => {
    const product = await deps.createProduct.execute(
      actorOf(res),
      ProductCreateSchema.parse(req.body),
    );
    res.status(201).json(toProductDto(product));
  });

  router.get('/products/:id', ...readGuards, async (req, res) => {
    res.json(
      toProductDto(await deps.getProduct.execute(actorOf(res), IdSchema.parse(req.params.id))),
    );
  });

  router.patch('/products/:id', ...writeGuards, async (req, res) => {
    const product = await deps.updateProduct.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      ProductUpdateSchema.parse(req.body),
    );
    res.json(toProductDto(product));
  });

  return router;
}
