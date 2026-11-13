/**
 * Gate prosecdef — dueños SECURITY DEFINER allowlisted.
 */
import { describe, expect, it } from 'vitest';
import { APP_SECURITY_DEFINER_OWNERS } from '../../scripts/migration-security-gates.js';
import { assertSecurityDefinerOwnersAllowlist } from '../../scripts/migration-security-gates.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;

describe.skipIf(!migratorUrl)('Gate prosecdef dueños', () => {
  it('allowlist incluye fabsoft_audit_definer', () => {
    expect(APP_SECURITY_DEFINER_OWNERS.has('fabsoft_audit_definer')).toBe(true);
  });

  it('BD sin dueños fuera de allowlist', async () => {
    await assertSecurityDefinerOwnersAllowlist(migratorUrl!);
  });
});
