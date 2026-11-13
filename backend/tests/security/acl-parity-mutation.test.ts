/**
 * Mutaciones M2–M4: assertSchemaAclParity debe fallar (exit≠0 equivalente).
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  assertSchemaAclParity,
  captureSchemaAclSnapshot,
} from '../../scripts/schema-acl-snapshot.js';

const migUrl = process.env.DATABASE_MIGRATION_URL;
const provUrl = process.env.DATABASE_PROVISION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && (!migUrl || !provUrl)) {
  throw new Error('acl-parity-mutation: URLs requeridas');
}

describe.skipIf(!migUrl || !provUrl)('ACL parity mutations', () => {
  it('M2: default migrator quita SELECT a app → paridad falla', async () => {
    const base = await captureSchemaAclSnapshot(migUrl!);
    const c = new pg.Client({ connectionString: provUrl! });
    await c.connect();
    try {
      await c.query(
        `alter default privileges for role fabsoft_migrator in schema app revoke select on tables from fabsoft_app`,
      );
      const corrupt = await captureSchemaAclSnapshot(migUrl!);
      expect(() => assertSchemaAclParity(base, corrupt)).toThrow(/ACL aclexplode/);
    } finally {
      await c.query(
        `alter default privileges for role fabsoft_migrator in schema app grant select on tables to fabsoft_app`,
      );
      await c.end();
    }
  });

  it('M3: GRANT SELECT (password_hash) on users → paridad falla', async () => {
    const base = await captureSchemaAclSnapshot(migUrl!);
    const c = new pg.Client({ connectionString: provUrl! });
    await c.connect();
    try {
      await c.query(`grant select (password_hash) on app.users to fabsoft_app`);
      const corrupt = await captureSchemaAclSnapshot(migUrl!);
      expect(() => assertSchemaAclParity(base, corrupt)).toThrow(/ACL aclexplode/);
    } finally {
      await c.query(`revoke select (password_hash) on app.users from fabsoft_app`);
      await c.end();
    }
  });

  it('N4 (upgrade): default migrator GRANT EXECUTE funciones a app → paridad falla', async () => {
    const base = await captureSchemaAclSnapshot(migUrl!);
    const c = new pg.Client({ connectionString: provUrl! });
    await c.connect();
    try {
      await c.query(
        `alter default privileges for role fabsoft_migrator in schema app grant execute on functions to fabsoft_app`,
      );
      const corrupt = await captureSchemaAclSnapshot(migUrl!);
      expect(() => assertSchemaAclParity(base, corrupt)).toThrow(/ACL aclexplode/);
    } finally {
      await c.query(
        `alter default privileges for role fabsoft_migrator in schema app revoke execute on functions from fabsoft_app`,
      );
      await c.end();
    }
  });

  it('M4: default global EXECUTE a worker → paridad falla', async () => {
    const base = await captureSchemaAclSnapshot(migUrl!);
    const c = new pg.Client({ connectionString: provUrl! });
    await c.connect();
    try {
      await c.query(
        `alter default privileges for role fabsoft_migrator grant execute on functions to fabsoft_worker`,
      );
      const corrupt = await captureSchemaAclSnapshot(migUrl!);
      expect(() => assertSchemaAclParity(base, corrupt)).toThrow(/ACL aclexplode/);
    } finally {
      await c.query(
        `alter default privileges for role fabsoft_migrator revoke execute on functions from fabsoft_worker`,
      );
      await c.end();
    }
  });
});
