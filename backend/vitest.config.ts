process.env.TZ = 'UTC';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup-openapi.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'src/**/*.test.ts',
            'tests/architecture/**/*.test.ts',
            'tests/helpers/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'api-memory',
          include: ['tests/api/**/*.test.ts'],
          exclude: ['tests/api/**/*.db.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'tests/integration/**/*.test.ts',
            'tests/contracts/**/*.test.ts',
            'tests/fixtures/**/*.test.ts',
          ],
          hookTimeout: 120_000,
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'api-db',
          include: ['tests/api/**/*.db.test.ts'],
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: ['tests/perf/**/*.test.ts'],
          hookTimeout: 120_000,
          testTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'security',
          include: ['tests/security/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/domain/**', 'src/application/**'],
      exclude: ['**/*.test.ts', '**/ports.ts'],
      thresholds: {
        'src/domain/subscriptions/**': {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        'src/application/subscriptions/**': {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
