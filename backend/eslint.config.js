import { base, layerRules } from '@fabsoft/config/eslint';
import { f0TestOwnerBypassRules } from './eslint.f0-05.js';

export default [...base, ...layerRules, ...f0TestOwnerBypassRules];
