import { z } from 'zod';
import { ProductStatusSchema, ProductTypeSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

/** Catálogo de productos (docs/api/openapi.yaml: Product, ProductCreate, ProductUpdate, ProductPage). */
export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  productType: ProductTypeSchema,
  vendor: z.string().nullable(),
  referenceCode: z.string().nullable(),
  status: ProductStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductDto = z.infer<typeof ProductSchema>;

const productName = z.string().trim().min(2).max(150);

export const ProductCreateSchema = z
  .object({
    name: productName,
    description: z.union([z.string().trim().max(2000), z.null()]).optional(),
    productType: ProductTypeSchema,
    vendor: z.union([z.string().trim().max(150), z.null()]).optional(),
    referenceCode: z.union([z.string().trim().max(100), z.null()]).optional(),
  })
  .strict();
export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;

export const ProductUpdateSchema = z
  .object({
    name: productName.optional(),
    description: z.union([z.string().trim().max(2000), z.null()]).optional(),
    productType: ProductTypeSchema.optional(),
    vendor: z.union([z.string().trim().max(150), z.null()]).optional(),
    referenceCode: z.union([z.string().trim().max(100), z.null()]).optional(),
    status: ProductStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Se requiere al menos un campo' });
export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;

export const ProductPageSchema = z.object({
  data: z.array(ProductSchema),
  meta: PaginationMetaSchema,
});
export type ProductPage = z.infer<typeof ProductPageSchema>;

const csvProductTypes = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(ProductTypeSchema));

export const ProductListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  productType: csvProductTypes.optional(),
  status: ProductStatusSchema.optional(),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;
