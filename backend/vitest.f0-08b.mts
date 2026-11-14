process.env.TZ = 'UTC';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/security/t-f0-08b-event-trigger.test.ts'],
    setupFiles: ['./tests/setup-openapi.ts'],
  },
});
