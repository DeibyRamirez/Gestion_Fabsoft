import type { Express } from 'express';
import { buildContainer } from '../../src/composition/container.js';
import { buildPgInfra } from '../../src/composition/pg-infra.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { testEnvSource } from './env.js';
import { ensureAppPoolRoleVerified } from './db.js';

let cached: Express | undefined;

/** API real contra Postgres de test (composition root + Pg). */
export async function buildTestApp(): Promise<Express> {
  if (cached) return cached;
  const env = loadEnv(testEnvSource({ APP_VERSION: process.env.APP_VERSION ?? 'test' }));
  await ensureAppPoolRoleVerified();
  const infra = await buildPgInfra(env);
  cached = createApp(buildContainer(env, infra));
  return cached;
}

export async function closeTestApp(): Promise<void> {
  cached = undefined;
}
