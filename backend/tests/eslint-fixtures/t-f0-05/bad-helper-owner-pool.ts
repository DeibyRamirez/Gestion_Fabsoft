/** Fixture ESLint T-F0-05 (debe fallar lint): getOwnerPool en helper fuera de allowlist. */
import { getOwnerPool } from '../../helpers/db.js';

export async function leak(): Promise<void> {
  await getOwnerPool().query('select 1');
}
