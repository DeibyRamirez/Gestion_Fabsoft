/**
 * Gate fabsoft_audit_definer + M5c (0006 no vía owner sin harness).
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAuditDefinerRoleAttributes } from '../../scripts/migration-security-gates.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;
const provisionUrl = process.env.DATABASE_PROVISION_URL;
const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe.skipIf(!migratorUrl)('audit_definer gate', () => {
  it('rol y search_path audit_write', async () => {
    await assertAuditDefinerRoleAttributes(migratorUrl!);
  });

  it.skipIf(!provisionUrl)(
    'M5c: DATABASE_MIGRATION_URL owner sin elevación → falla cerrado',
    () => {
      const run = spawnSync('pnpm', ['exec', 'tsx', 'scripts/dbmate-staged-up.ts'], {
        cwd: backendRoot,
        env: {
          ...process.env,
          DATABASE_MIGRATION_URL: provisionUrl!,
          DATABASE_PROVISION_URL: '',
        } as NodeJS.ProcessEnv,
        encoding: 'utf8',
      });
      expect(run.status).not.toBe(0);
      expect(`${run.stderr}\n${run.stdout}`).toMatch(/fabsoft_migrator|migrator/i);
    },
  );
});
