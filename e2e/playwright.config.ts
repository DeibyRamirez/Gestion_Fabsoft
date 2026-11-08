import { defineConfig, devices } from '@playwright/test';

const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
const webBase = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:3000';

function backendWebEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries({ ...process.env }).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
  delete env.JWT_PRIVATE_KEY;
  delete env.JWT_PUBLIC_KEYS;
  env.TZ = 'UTC';
  env.APP_ENV = 'test';
  env.PORT = '4000';
  return env;
}

export default defineConfig({
  testDir: './smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: '../playwright-report', open: 'never' }]],
  use: {
    baseURL: webBase,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @fabsoft/backend start',
      url: `${apiBase}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: backendWebEnv(),
    },
    {
      command: 'pnpm --filter @fabsoft/frontend start',
      url: webBase,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        TZ: 'UTC',
      },
    },
  ],
});
