// @ts-check
/** T-F0-05 — sin bypass owner-system / getOwnerPool en tests (lint primario). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));

const fixtureLint = process.env.T_F0_05_FIXTURE_LINT === '1';

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

/** Rutas relativas (p. ej. ./db.js) no casan solo con helpers/db; incluir sufijos db. */
const poolImportPatterns = [
  {
    group: ['**/db', '**/db.js', '**/helpers/db', '**/helpers/db.js'],
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

const ownerImportExpressionSyntax = [
  {
    selector: 'ImportExpression[source.value=/owner-system/]',
    message: 'T-F0-05: import() hacia owner-system prohibido fuera de allowlist.',
  },
];

const dbModuleImportSpecifier = [
  {
    selector:
      'ImportDeclaration[source.value=/^(?:\\.\\.\\/|\\.)?(?:.*\\/)?db(?:\\.js)?$/] ImportSpecifier[imported.name="getOwnerPool"], ImportDeclaration[source.value=/helpers\\/db/] ImportSpecifier[imported.name="getOwnerPool"]',
    message: 'T-F0-05: no import getOwnerPool desde módulo db.',
  },
];

const getOwnerPoolUsageSyntax = [
  {
    selector: 'Identifier[name="getOwnerPool"]',
    message: 'T-F0-05: no usar getOwnerPool.',
  },
  {
    selector: 'MemberExpression[property.name="getOwnerPool"]',
    message: 'T-F0-05: no acceder getOwnerPool en módulo db.',
  },
  {
    selector:
      'MemberExpression[computed=true][property.type="BinaryExpression"] Literal[value="getOwner"], MemberExpression[computed=true][property.type="BinaryExpression"] Literal[value="Pool"]',
    message: 'T-F0-05: getOwnerPool vía clave computada en módulo db.',
  },
  {
    selector: 'MemberExpression[computed=true][object.name="db"]',
    message: 'T-F0-05: acceso computado al namespace del módulo db.',
  },
];

const ownerBypassInSource = [
  {
    selector: 'ImportDeclaration[source.value=/owner-system/]',
    message: 'T-F0-05: no import owner-system.',
  },
  ...dbModuleImportSpecifier,
  ...reexportOwnerSyntax,
  {
    selector: 'Identifier[name="withOwnerSystemContext"]',
    message: 'T-F0-05: no usar withOwnerSystemContext.',
  },
  ...getOwnerPoolUsageSyntax,
  ...ownerImportExpressionSyntax,
  ...nonLiteralDynamicImport,
];

const helperFixtureSyntax = [
  ...reexportOwnerSyntax,
  ...dbModuleImportSpecifier,
  ...getOwnerPoolUsageSyntax,
  ...ownerImportExpressionSyntax,
  ...nonLiteralDynamicImport,
];

const allowlistRel = OWNER_ALLOWLIST.map((abs) =>
  path.relative(backendRoot, abs).replace(/\\/g, '/'),
);

const eslintIgnores = fixtureLint
  ? ['tests/eslint-fixtures/**', '!tests/eslint-fixtures/t-f0-05/**']
  : ['tests/eslint-fixtures/**'];

/** @type {import('eslint').Linter.Config[]} */
export const f0TestOwnerBypassRules = [
  {
    ignores: eslintIgnores,
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
    files: ['tests/helpers/**/*.ts', 'tests/fixtures/**/*.ts'],
    ignores: allowlistRel,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...ownerImportPatterns, ...poolImportPatterns] },
      ],
      'no-restricted-syntax': ['error', ...helperFixtureSyntax],
    },
  },
  ...(fixtureLint
    ? [
        {
          files: ['tests/eslint-fixtures/t-f0-05/**/*.{ts,tsx}'],
          rules: {
            'no-restricted-imports': [
              'error',
              { patterns: [...ownerImportPatterns, ...poolImportPatterns] },
            ],
            'no-restricted-syntax': ['error', ...helperFixtureSyntax],
          },
        },
      ]
    : []),
  {
    files: allowlistRel,
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
