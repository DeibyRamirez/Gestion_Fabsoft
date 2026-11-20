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
  // La suite usa logins frescos por contexto; el límite anti-abuso no aplica aquí.
  env.LOGIN_RATE_LIMIT_PER_MINUTE ??= '1000';
  env.LOGIN_RATE_LIMIT_PER_EMAIL ??= '1000';
  return env;
}

export default defineConfig({
  testDir: './smoke',
  globalSetup: './global-setup.ts',
  timeout: process.env.CI ? 90_000 : 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // La cookie de refresh rota en cada carga: serializar evita que dos contextos
  // reutilicen el mismo token y revoquen la familia.
  workers: 1,
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
