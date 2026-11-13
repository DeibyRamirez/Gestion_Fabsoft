// Config sólo para validar fixtures T-F0-05 (mutaciones deben fallar lint).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { f0FixtureLintBlock } from './eslint.f0-05.js';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, f0FixtureLintBlock);
