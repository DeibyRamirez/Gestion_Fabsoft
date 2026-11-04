import { beforeAll } from 'vitest';
import { initOpenApiValidation } from './helpers/openapi-ajv.js';

beforeAll(async () => {
  await initOpenApiValidation();
});
