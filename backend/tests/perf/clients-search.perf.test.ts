import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import { createFactories } from '../fixtures/factories.js';

assertDbTestsRequired();

const WARMUP_ROUNDS = 2;
const MEASURED_REQUESTS = 200;
const THRESHOLD_P95_MS = 500;

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]!;
}

describe.skipIf(!dbTestsConfigured())('perf-smoke clients-search', () => {
  let factories: ReturnType<typeof createFactories>;

  beforeAll(async () => {
    factories = createFactories({ seed: 42, tokens: await getTestAccessTokens() });
    await resetDatabase();
    await factories.bulkClients(10_000);
    await factories.adminUser();
  }, 120_000);

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('arnés de medición (health/ready) cumple p95 < 500ms', async () => {
    const app = await buildTestApp();
    const samples: number[] = [];

    for (let w = 0; w < WARMUP_ROUNDS; w++) {
      await request(app).get('/api/v1/health/ready');
    }

    for (let i = 0; i < MEASURED_REQUESTS; i++) {
      const t0 = performance.now();
      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(200);
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const p99 = percentile(samples, 99);
    const max = samples[samples.length - 1]!;
    const passed = p95 < THRESHOLD_P95_MS;

    const payload = {
      test: 'clients-search',
      commit: process.env.GITHUB_SHA ?? 'local',
      dataset: { clients: 10_000, seed: 42 },
      requests: MEASURED_REQUESTS,
      warmupRounds: WARMUP_ROUNDS,
      p50_ms: Math.round(p50 * 100) / 100,
      p95_ms: Math.round(p95 * 100) / 100,
      p99_ms: Math.round(p99 * 100) / 100,
      max_ms: Math.round(max * 100) / 100,
      threshold_p95_ms: THRESHOLD_P95_MS,
      passed,
      runner: process.env.RUNNER_OS ?? 'local',
      pg: '16',
    };

    writeFileSync(
      join(process.cwd(), 'perf-results.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
    );

    expect(passed).toBe(true);
  }, 120_000);

  it('GET /api/v1/clients?q= y ?taxId= dentro del umbral p95', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const samplesQ: number[] = [];
    const samplesTax: number[] = [];

    for (let w = 0; w < WARMUP_ROUNDS; w++) {
      await request(app).get('/api/v1/clients?q=a').set('Authorization', `Bearer ${token}`);
    }

    for (let i = 0; i < MEASURED_REQUESTS; i++) {
      const t0 = performance.now();
      const res = await request(app)
        .get('/api/v1/clients?q=ñ')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      samplesQ.push(performance.now() - t0);
    }

    const one = await request(app)
      .get('/api/v1/clients?pageSize=1')
      .set('Authorization', `Bearer ${token}`);
    const taxId = one.body.data[0]?.taxId as string | undefined;

    for (let w = 0; w < WARMUP_ROUNDS; w++) {
      if (taxId) {
        await request(app)
          .get(`/api/v1/clients?taxId=${encodeURIComponent(taxId)}`)
          .set('Authorization', `Bearer ${token}`);
      }
    }

    for (let i = 0; i < MEASURED_REQUESTS; i++) {
      const t0 = performance.now();
      const res = taxId
        ? await request(app)
            .get(`/api/v1/clients?taxId=${encodeURIComponent(taxId)}`)
            .set('Authorization', `Bearer ${token}`)
        : await request(app).get('/api/v1/clients').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      samplesTax.push(performance.now() - t0);
    }

    samplesQ.sort((a, b) => a - b);
    samplesTax.sort((a, b) => a - b);
    const p95Q = percentile(samplesQ, 95);
    const p95Tax = percentile(samplesTax, 95);
    const passed = p95Q < THRESHOLD_P95_MS && p95Tax < THRESHOLD_P95_MS;

    writeFileSync(
      join(process.cwd(), 'perf-results.json'),
      `${JSON.stringify(
        {
          test: 'clients-search',
          commit: process.env.GITHUB_SHA ?? 'local',
          dataset: { clients: 10_000, seed: 42 },
          endpoints: {
            q: { p95_ms: Math.round(p95Q * 100) / 100, requests: MEASURED_REQUESTS },
            taxId: { p95_ms: Math.round(p95Tax * 100) / 100, requests: MEASURED_REQUESTS },
          },
          threshold_p95_ms: THRESHOLD_P95_MS,
          passed,
        },
        null,
        2,
      )}\n`,
    );

    expect(passed).toBe(true);
  }, 180_000);
});
