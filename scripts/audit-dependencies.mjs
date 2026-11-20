#!/usr/bin/env node
/**
 * Auditoría de dependencias de producción con riesgos aceptados explícitamente.
 * Falla ante cualquier high/critical no aceptado o si una aceptación expiró.
 */
import { execSync } from 'node:child_process';

const accepted = {
  'GHSA-mrhx-c7xc-m3w5': {
    module: 'zod',
    severity: 'high',
    reviewBy: '2027-02-28',
    reason:
      'Zod 3 no tiene parche; mitigado por límite de cuerpo 100 KB y esquemas/paginación acotados. Revisar al migrar a Zod 4 + zod-to-openapi 8.',
  },
  'GHSA-w5hq-g745-h8pq': {
    module: 'uuid',
    severity: 'moderate',
    reviewBy: '2027-02-28',
    reason:
      'Dependencia transitiva de pg-boss; sólo usa uuid v4, no v3/v5/v6 con buffers controlados por el usuario.',
  },
  'GHSA-g3hv-75wg-m249': {
    module: 'minimatch',
    severity: 'moderate',
    reviewBy: '2027-02-28',
    reason:
      'Herramienta de lint del workspace (typescript-eslint); no se ejecuta en la API desplegada.',
  },
};

let raw = '';
try {
  raw = execSync('pnpm audit --prod --json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
  });
} catch (error) {
  raw = String(error?.stdout ?? '');
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('No se pudo interpretar `pnpm audit --json`');
  process.exit(1);
}

const advisories = Object.values(report.advisories ?? {});
const now = new Date();
const failures = [];
const acceptedRows = [];

for (const advisory of advisories) {
  const id = advisory.github_advisory_id ?? String(advisory.id);
  const severity = advisory.severity;
  const acceptedRisk = accepted[id];
  if (acceptedRisk && new Date(acceptedRisk.reviewBy) >= now) {
    acceptedRows.push({
      id,
      module: advisory.module_name,
      severity,
      reviewBy: acceptedRisk.reviewBy,
    });
    continue;
  }
  if (severity === 'high' || severity === 'critical') {
    failures.push({ id, module: advisory.module_name, severity, title: advisory.title });
  }
}

console.log(
  JSON.stringify(
    {
      audit: failures.length === 0 ? 'ok' : 'failed',
      highCriticalRejected: failures,
      accepted: acceptedRows,
      advisoryCount: advisories.length,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exit(1);
