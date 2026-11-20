import { describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition/container.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { createApp } from '../../src/interfaces/http/app.js';
import { MemoryStore, memoryInfra } from '../fixtures/memory-infra.js';
import {
  collectExpressRoutes,
  installExpressRouteInventory,
  normalizeExpressPath,
} from './express-routes.js';
import { loadOpenApiSpec } from './openapi.js';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const DOCS_PREFIX = '/api/v1/docs';
const PENDING_OPERATIONS = new Set([
  'createClientNote',
  'listClientNotes',
  'listSubscriptionNotifications',
]);

type Operation = {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
  pending: boolean;
  responses?: Record<string, unknown>;
};

function documentedOperations(): Operation[] {
  const spec = loadOpenApiSpec();
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, value] of Object.entries(item as Record<string, unknown>)) {
      if (!HTTP_METHODS.has(method) || !value || typeof value !== 'object') continue;
      const op = value as Record<string, unknown>;
      operations.push({
        method: method.toUpperCase(),
        path,
        ...(typeof op['operationId'] === 'string' ? { operationId: op['operationId'] } : {}),
        ...(typeof op['summary'] === 'string' ? { summary: op['summary'] } : {}),
        ...(Array.isArray(op['tags']) ? { tags: op['tags'] as string[] } : {}),
        pending: op['x-implementation-status'] === 'pending',
        ...(op['responses'] && typeof op['responses'] === 'object'
          ? { responses: op['responses'] as Record<string, unknown> }
          : {}),
      });
    }
  }
  return operations;
}

describe('cobertura de rutas OpenAPI', () => {
  it('toda ruta implementada está documentada y toda operación vigente existe', async () => {
    installExpressRouteInventory();
    const app = createApp(
      buildContainer(loadEnv({ APP_ENV: 'test' }), await memoryInfra(new MemoryStore())),
    );
    const actual = collectExpressRoutes(app)
      .filter((route) => route.path.startsWith('/api/v1'))
      .filter((route) => !route.path.startsWith(DOCS_PREFIX))
      .map((route) => `${route.method} ${normalizeExpressPath(route.path)}`)
      .sort();

    const documented = documentedOperations();
    const implemented = documented
      .filter((operation) => !operation.pending)
      .map((operation) => `${operation.method} ${operation.path}`)
      .sort();

    const undocumented = actual.filter((route) => !implemented.includes(route));
    const missing = implemented.filter((route) => !actual.includes(route));

    expect(undocumented, 'rutas implementadas sin documentar').toEqual([]);
    expect(missing, 'operaciones documentadas sin implementar').toEqual([]);
  });

  it('las operaciones pendientes están identificadas y justificadas', () => {
    const pending = documentedOperations().filter((operation) => operation.pending);
    expect(new Set(pending.map((operation) => operation.operationId))).toEqual(PENDING_OPERATIONS);
  });

  it('el contrato mantiene operationIds únicos y metadatos mínimos', () => {
    const operations = documentedOperations();
    const ids = operations.map((operation) => operation.operationId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);

    for (const operation of operations) {
      expect(operation.path.startsWith('/api/v1/'), `${operation.operationId}: path`).toBe(true);
      expect(
        operation.operationId,
        `${operation.method} ${operation.path}: operationId`,
      ).toBeTruthy();
      expect(operation.summary, `${operation.operationId}: summary`).toBeTruthy();
      expect(operation.tags?.length, `${operation.operationId}: tags`).toBeGreaterThan(0);
      expect(operation.responses, `${operation.operationId}: responses`).toBeTruthy();
    }
  });
});
