import type { ProductListQuery } from '@fabsoft/shared';
import type {
  CreateProductRepository,
  CreateProductOutcome,
  NewProduct,
} from '../../../../application/products/create-product/ports.js';
import type { GetProductQuery } from '../../../../application/products/get-product/ports.js';
import type { ListProductsQuery } from '../../../../application/products/list-products/ports.js';
import type {
  UpdateProductOutcome,
  UpdateProductRepository,
  ProductPatch,
} from '../../../../application/products/update-product/ports.js';
import type { ProductView } from '../../../../application/products/shared/product-view.js';
import type { Tx } from '../../../db/with-rls-context.js';
import { PG, pgCode } from '../shared/pg-errors.js';
import { PRODUCT_COLUMNS, type ProductRow, toProductView } from '../shared/product-columns.js';

const SORT: Record<ProductListQuery['sort'], string> = {
  name: 'name asc, id',
  '-name': 'name desc, id',
  createdAt: 'created_at asc, id',
  '-createdAt': 'created_at desc, id',
};

export class PgListProductsQuery implements ListProductsQuery {
  constructor(private readonly tx: Tx) {}
  async list(q: ProductListQuery): Promise<{ items: ProductView[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      values.push(v);
      where.push(sql.replace('?', `$${values.length}`));
    };
    if (q.q) {
      const term = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
      values.push(term, term);
      where.push(
        `(name ilike $${values.length - 1} or coalesce(vendor, '') ilike $${values.length})`,
      );
    }
    if (q.productType?.length) add('product_type = any(?::app.product_type[])', q.productType);
    if (q.status) add('status = ?::app.product_status', q.status);
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::text as n from app.products ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<ProductRow>(
      `select ${PRODUCT_COLUMNS} from app.products ${filter} order by ${SORT[q.sort]} limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: rows.map(toProductView), total: Number(count.rows[0]?.n ?? 0) };
  }
}

export class PgGetProductQuery implements GetProductQuery {
  constructor(private readonly tx: Tx) {}
  async findById(id: string): Promise<ProductView | null> {
    const { rows } = await this.tx.query<ProductRow>(
      `select ${PRODUCT_COLUMNS} from app.products where id = $1`,
      [id],
    );
    return rows[0] ? toProductView(rows[0]) : null;
  }
}

export class PgCreateProductRepository implements CreateProductRepository {
  constructor(private readonly tx: Tx) {}
  async insert(u: NewProduct): Promise<CreateProductOutcome> {
    try {
      const { rows } = await this.tx.query<ProductRow>(
        `insert into app.products (name, description, product_type, vendor, reference_code, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $6) returning ${PRODUCT_COLUMNS}`,
        [u.name, u.description, u.productType, u.vendor, u.referenceCode, u.createdBy],
      );
      return { ok: true, product: toProductView(rows[0] as ProductRow) };
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation) return { ok: false, reason: 'duplicate_product' };
      throw err;
    }
  }
}

export class PgUpdateProductRepository implements UpdateProductRepository {
  constructor(private readonly tx: Tx) {}
  async loadForUpdate(id: string): Promise<ProductView | null> {
    const { rows } = await this.tx.query<ProductRow>(
      `select ${PRODUCT_COLUMNS} from app.products where id = $1 for update`,
      [id],
    );
    return rows[0] ? toProductView(rows[0]) : null;
  }
  async save(id: string, p: ProductPatch): Promise<UpdateProductOutcome> {
    try {
      const { rows } = await this.tx.query<ProductRow>(
        `update app.products set
           name = coalesce($2, name),
           description = case when $3::boolean then $4 else description end,
           product_type = coalesce($5, product_type),
           vendor = case when $6::boolean then $7 else vendor end,
           reference_code = case when $8::boolean then $9 else reference_code end,
           status = coalesce($10, status),
           updated_by = $11
         where id = $1 returning ${PRODUCT_COLUMNS}`,
        [
          id,
          p.name ?? null,
          p.description !== undefined,
          p.description ?? null,
          p.productType ?? null,
          p.vendor !== undefined,
          p.vendor ?? null,
          p.referenceCode !== undefined,
          p.referenceCode ?? null,
          p.status ?? null,
          p.updatedBy,
        ],
      );
      return { ok: true, product: toProductView(rows[0] as ProductRow) };
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation) return { ok: false, reason: 'duplicate_product' };
      throw err;
    }
  }
}
