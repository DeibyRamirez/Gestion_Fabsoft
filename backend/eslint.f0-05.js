// @ts-check
/** T-F0-05 — sin bypass owner-system / getOwnerPool en tests (lint primario). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));

const OWNER_ALLOWLIST = [
  'tests/helpers/owner-system.ts',
  'tests/helpers/db.ts',
  'tests/helpers/owner-bypass-detector.ts',
  'tests/fixtures/factories.ts',
].map((p) => path.join(backendRoot, p));

const ownerImportPatterns = [
  {
    group: ['**/owner-system', '**/owner-system.js', '**/owner-system.ts'],
    message: 'T-F0-05: no importar owner-system fuera de la allowlist.',
  },
];

const ownerImportPaths = [
  {
    name: 'withOwnerSystemContext',
    message: 'T-F0-05: withOwnerSystemContext sólo vía allowlist owner-system.',
  },
];

const poolImportPatterns = [
  {
    group: ['**/helpers/db', '**/helpers/db.js'],
    importNames: ['getOwnerPool'],
    message: 'T-F0-05: getOwnerPool fuera de allowlist (usar fabsoft_app / API).',
  },
];

const reexportOwnerSyntax = [
  {
    selector:
      'ExportAllDeclaration[source.value=/owner-system/], ExportNamedDeclaration[source.value=/owner-system/]',
    message: 'T-F0-05: no re-exportar desde owner-system.',
  },
  {
    selector:
      'ExportNamedDeclaration[source=null] ExportSpecifier[exported.name="withOwnerSystemContext"], ExportNamedDeclaration[source=null] ExportSpecifier[exported.name="ctx"][local.name="withOwnerSystemContext"]',
    message: 'T-F0-05: no re-exportar withOwnerSystemContext (ni alias ctx).',
  },
];

const nonLiteralDynamicImport = [
  {
    selector:
      'ImportExpression[source.type!="Literal"][source.type!="TemplateLiteral"], ImportExpression TemplateLiteral[expressions.length>0]',
    message: 'T-F0-05: import() en tests debe usar ruta literal (sin clave computada).',
  },
];

const ownerBypassInSource = [
  {
    selector: 'ImportDeclaration[source.value=/owner-system/]',
    message: 'T-F0-05: no import owner-system.',
  },
  {
    selector: 'ImportDeclaration[source.value=/helpers\\/db/] ImportSpecifier[imported.name="getOwnerPool"]',
    message: 'T-F0-05: no import getOwnerPool.',
  },
  ...reexportOwnerSyntax,
  {
    selector: 'Identifier[name="getOwnerPool"]',
    message: 'T-F0-05: no usar getOwnerPool.',
  },
  {
    selector: 'Identifier[name="withOwnerSystemContext"]',
    message: 'T-F0-05: no usar withOwnerSystemContext.',
  },
  ...nonLiteralDynamicImport,
];

const allowlistRel = OWNER_ALLOWLIST.map((abs) => path.relative(backendRoot, abs).replace(/\\/g, '/'));

/** Reglas aplicadas a fixtures T-F0-05 bajo lint explícito (--config eslint.t-f0-05-fixtures.config.js). */
export const f0FixtureLintBlock = {
  files: ['**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [...ownerImportPatterns, ...poolImportPatterns],
        paths: ownerImportPaths,
      },
    ],
    'no-restricted-syntax': ['error', ...ownerBypassInSource, ...reexportOwnerSyntax],
  },
};

/** @type {import('eslint').Linter.Config[]} */
export const f0TestOwnerBypassRules = [
  {
    ignores: ['tests/eslint-fixtures/**'],
  },
  {
    files: ['tests/{security,api,integration}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [...ownerImportPatterns, ...poolImportPatterns],
          paths: ownerImportPaths,
        },
      ],
      'no-restricted-syntax': ['error', ...ownerBypassInSource],
    },
  },
  {
    files: ['tests/helpers/**/*.ts'],
    ignores: OWNER_ALLOWLIST.map((abs) => path.relative(backendRoot, abs)),
    rules: {
      'no-restricted-imports': ['error', { patterns: [...ownerImportPatterns, ...poolImportPatterns] }],
      'no-restricted-syntax': [
        'error',
        ...reexportOwnerSyntax,
        {
          selector:
            'ImportDeclaration[source.value=/helpers\\/db/] ImportSpecifier[imported.name="getOwnerPool"]',
          message: 'T-F0-05: helper no debe importar getOwnerPool.',
        },
        {
          selector: 'Identifier[name="getOwnerPool"]',
          message: 'T-F0-05: helper no debe usar getOwnerPool.',
        },
        ...nonLiteralDynamicImport,
      ],
    },
  },
  {
    files: allowlistRel,
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
