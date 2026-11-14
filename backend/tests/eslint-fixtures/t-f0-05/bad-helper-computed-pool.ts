/** Fixture ESLint T-F0-05 (debe fallar lint): clave computada sobre namespace db. */
import * as db from '../../helpers/db.js';

export async function leakViaComputedKey(): Promise<void> {
  const pool = db['getOwner' + 'Pool'];
  await pool().query('select 1');
}
