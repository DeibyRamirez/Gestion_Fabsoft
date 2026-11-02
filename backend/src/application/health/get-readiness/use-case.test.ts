import { describe, expect, it } from 'vitest';
import { GetReadiness } from './use-case.js';

const info = { version: () => '1.0.0' };
const check = (name: string, ok: boolean) => ({ name, check: async () => ok });

describe('GetReadiness', () => {
  it('ok cuando la BD responde', async () => {
    expect(await new GetReadiness([check('database', true)], info).execute()).toEqual({
      status: 'ok',
      version: '1.0.0',
      checks: { database: 'ok' },
    });
  });
  it('down cuando la BD falla', async () => {
    const r = await new GetReadiness([check('database', false)], info).execute();
    expect(r.status).toBe('down');
    expect(r.checks).toEqual({ database: 'fail' });
  });
});
