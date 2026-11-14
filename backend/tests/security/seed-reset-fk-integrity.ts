/**
 * Comprueba que no hay FKs huérfanas hacia users/clients/products en schema app.
 */
import type pg from 'pg';

type FkMeta = {
  src: string;
  dst: string;
  src_cols: string[];
  dst_cols: string[];
};

function quoteSqlIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/** pg puede devolver text[] como array JS o literal PostgreSQL. */
function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    const t = val.trim();
    if (t.startsWith('{') && t.endsWith('}')) {
      const inner = t.slice(1, -1);
      if (inner === '') return [];
      return inner.split(',').map((s) => s.trim().replace(/^"(.*)"$/, '$1'));
    }
    return [t];
  }
  return [];
}

async function listAppCoreForeignKeys(client: pg.Client): Promise<FkMeta[]> {
  const { rows } = await client.query<FkMeta>(
    `select c.conrelid::regclass::text as src,
            c.confrelid::regclass::text as dst,
            array_agg(sa.attname order by u.ord) as src_cols,
            array_agg(ta.attname order by u.ord) as dst_cols
     from pg_catalog.pg_constraint c
     join pg_catalog.pg_namespace n on n.oid = c.connamespace
     join lateral unnest(c.conkey) with ordinality as u(attnum, ord) on true
     join pg_attribute sa on sa.attrelid = c.conrelid and sa.attnum = u.attnum
     join pg_attribute ta on ta.attrelid = c.confrelid and ta.attnum = c.confkey[u.ord]
     where n.nspname = 'app'
       and c.contype = 'f'
       and c.confrelid::regclass::text = any ($1::text[])
     group by c.oid, c.conrelid, c.confrelid
     order by 1`,
    [['app.users', 'app.clients', 'app.products']],
  );
  return rows.map((r) => ({
    ...r,
    src_cols: asStringArray(r.src_cols),
    dst_cols: asStringArray(r.dst_cols),
  }));
}

/** Devuelve etiquetas legibles de violaciones (vacío = integridad OK). */
export async function findOrphanCoreForeignKeys(client: pg.Client): Promise<string[]> {
  const fks = await listAppCoreForeignKeys(client);
  const violations: string[] = [];
  for (const fk of fks) {
    const notNull = fk.src_cols.map((c) => `s.${quoteSqlIdent(c)} is not null`).join(' and ');
    const join = fk.src_cols
      .map((c, i) => `d.${quoteSqlIdent(fk.dst_cols[i]!)} = s.${quoteSqlIdent(c)}`)
      .join(' and ');
    const label = `${fk.src}(${fk.src_cols.join(',')})→${fk.dst}`;
    const { rowCount } = await client.query(
      `select 1
       from ${fk.src} s
       where (${notNull})
         and not exists (select 1 from ${fk.dst} d where ${join})
       limit 1`,
    );
    if ((rowCount ?? 0) > 0) violations.push(label);
  }
  return violations;
}
