import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato de repositorios de 0003/0004 (docs/security/threat-model.md §3, §3.1, §6):
 *  - app.users: sin `select *` ni `returning *`; password_hash sólo vía app.auth_password_hash().
 *  - Portal: sólo app.portal_* ; integraciones: sólo app.integration_subscriptions(_periods).
 */
const PG_DIR = join(import.meta.dirname, '../../src/infrastructure/persistence/pg');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? files(f) : f.endsWith('.ts') ? [f] : [];
  });

describe('contrato de repositorios', () => {
  for (const file of files(PG_DIR)) {
    const rel = relative(PG_DIR, file);
    const sql = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    it(`${rel}: sin select/returning * ni lectura directa de password_hash`, () => {
      expect(sql).not.toMatch(/select\s+\*|returning\s+\*/i);
      expect(sql).not.toMatch(/select[^;`]*\bpassword_hash\b[^;`]*from\s+app\.users/i);
    });
    if (/^(portal|integrations)\//.test(rel)) {
      it(`${rel}: no lee tablas base de suscripciones`, () => {
        expect(sql).not.toMatch(/\bapp\.(subscriptions|subscription_periods)\b/);
      });
    }
  }
});
