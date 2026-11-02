// @ts-check
/**
 * Configuración ESLint 9 (flat) compartida.
 * Incluye las reglas de capas del backend (docs/architecture.md §2, ADR-006/007):
 *   interfaces -> application -> domain ; infrastructure -> application -> domain ; composition -> todo.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const pattern = (group, message) => ({ group, message });

/** Reglas de dependencia entre capas, aplicadas a `src/<capa>/**` del backend. */
export const layerRules = [
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            pattern(
              [
                '**/application/**',
                '**/infrastructure/**',
                '**/interfaces/**',
                '**/composition/**',
              ],
              'domain no depende de capas externas.',
            ),
            pattern(
              ['express', 'pg', 'pg-boss', 'resend', 'jose', 'argon2', 'node:*'],
              'domain es puro: sin I/O ni frameworks.',
            ),
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'domain no lee process.env.' },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            pattern(
              ['**/infrastructure/**', '**/interfaces/**', '**/composition/**'],
              'application sólo conoce domain y sus puertos.',
            ),
            pattern(
              ['express', 'pg', 'pg-boss', 'resend', 'jose', 'argon2'],
              'application no usa SDKs: define puertos.',
            ),
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'application recibe config inyectada.' },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            pattern(
              ['**/interfaces/**', '**/composition/**'],
              'infrastructure no depende de interfaces/composition.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['src/interfaces/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            pattern(
              ['**/infrastructure/**', '**/composition/**'],
              'interfaces recibe la infraestructura inyectada.',
            ),
            pattern(['pg', 'pg-boss'], 'interfaces no accede a la BD.'),
          ],
        },
      ],
    },
  },
];

/** Base para cualquier paquete TS del monorepo. */
export const base = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/next-env.d.ts',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  prettier,
);

export default base;
