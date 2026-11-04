import type { Express } from 'express';
import type { AccessTokenService } from '../../src/application/auth/ports.js';
import { buildContainer } from '../../src/composition/container.js';
import { buildPgInfra } from '../../src/composition/pg-infra.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { testEnvSource } from './env.js';
import { ensureAppPoolRoleVerified } from './db.js';

let cached: Express | undefined;
let cachedTokens: AccessTokenService | undefined;

/** API real contra Postgres de test (composition root + Pg). */
export async function buildTestApp(): Promise<Express> {
  if (cached) return cached;
  const env = loadEnv(testEnvSource({ APP_VERSION: process.env.APP_VERSION ?? 'test' }));
  await ensureAppPoolRoleVerified();
  const infra = await buildPgInfra(env);
  cachedTokens = infra.tokens;
  cached = createApp(buildContainer(env, infra));
  return cached;
}

/** Mismo emisor JWT que buildTestApp (tests de API con tokenFor). */
export async function getTestAccessTokens(): Promise<AccessTokenService> {
  await buildTestApp();
  if (!cachedTokens) throw new Error('tokens de test no inicializados');
  return cachedTokens;
}

export async function closeTestApp(): Promise<void> {
  cached = undefined;
  cachedTokens = undefined;
}
