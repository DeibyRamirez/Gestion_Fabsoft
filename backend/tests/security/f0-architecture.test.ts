/**
 * T-F0-05 — suite security sin withOwnerSystemContext (arquitectura runtime).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const securityDir = join(fileURLToPath(new URL('.', import.meta.url)));

describe('F0 — arquitectura tests seguridad', () => {
  it('T-F0-05 ningún *.test.ts en security/ importa withOwnerSystemContext', () => {
    const files = readdirSync(securityDir).filter((f) => f.endsWith('.test.ts'));
    const offenders: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(securityDir, f), 'utf8');
      if (/withOwnerSystemContext/.test(body) && /from\s+['"].*helpers\/db/.test(body)) {
        offenders.push(f);
      }
    }
    expect(offenders, `Usar fabsoft_app/owner fixture, no owner system: ${offenders.join(',')}`).toEqual(
      [],
    );
  });
});
