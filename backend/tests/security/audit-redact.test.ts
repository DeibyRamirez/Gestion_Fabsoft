/**
 * Redacción TS (B1) — paridad con app.audit_write en allowlist/recursión.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeAuditKeys,
  prepareAuditChanges,
  redact,
} from '../../src/infrastructure/persistence/pg/shared/audit-redact.js';

describe('audit-redact (TS)', () => {
  it('allowlist recursiva y secretos camelCase / jwt / private_key', () => {
    const out = redact(
      {
        price_amount: 1,
        passwordHash: 'leak',
        nested: { apiKey: 'k', ok: true, extra: 'drop' },
        scopes: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'],
      },
      ['price_amount', 'nested', 'scopes'],
    ) as Record<string, unknown>;
    expect(out.passwordHash).toBe('[REDACTED]');
    expect(out.nested).toEqual({ apiKey: '[REDACTED]' });
    expect(out.scopes).toEqual(['[REDACTED]']);
    expect(out.extra).toBeUndefined();
  });

  it('B1-TS mutación: tipo escalar inesperado en raíz → ROJO', () => {
    expect(() => redact(42)).toThrow(/tipo escalar inesperado/);
  });

  it('credentials.pass en objeto', () => {
    const out = redact({ credentials: { pass: 'x', id: 'y' } }, ['credentials']) as Record<
      string,
      unknown
    >;
    expect(out.credentials).toEqual({ pass: '[REDACTED]' });
  });

  it('normalizeAuditKeys: camelCase → snake_case anidado', () => {
    const out = normalizeAuditKeys({
      productType: 'own',
      nested: { fullName: 'X', clientId: null },
    }) as Record<string, unknown>;
    expect(out.product_type).toBe('own');
    expect(out.nested).toEqual({ full_name: 'X', client_id: null });
  });

  it('Date serializa a ISO, no {}', () => {
    const d = new Date('2026-01-15T12:00:00.000Z');
    const out = prepareAuditChanges({ after: { startDate: d } }) as {
      after: { start_date: string };
    };
    expect(out.after.start_date).toBe('2026-01-15T12:00:00.000Z');
  });
});