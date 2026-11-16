/** Fixture fuera del glob security/api/integration: lint T-F0-05 debe seguir fallando si se escanea. */
import { withOwnerSystemContext } from '../helpers/owner-system.js';

export const probe = withOwnerSystemContext;
