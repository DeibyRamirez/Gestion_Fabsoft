#!/usr/bin/env node
/** Escaneo local de secretos de alta confianza sobre archivos versionados. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const ignored =
  /^(docs\/|qa\/|fuentes\/|contexto\/|artifacts\/|test-results\/|playwright-report\/)|(^|\/)(package-lock\.json|pnpm-lock\.yaml)$|(^|\/)\.env\.example$|\.(test|spec)\.(ts|tsx|js|mjs)$|^backend\/tests\/|^e2e\/smoke\//;

const patterns = [
  { name: 'private key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Slack token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Resend key', regex: /re_[A-Za-z0-9]{32,}/ },
  { name: 'live API key', regex: /fsk_live_[A-Za-z0-9_-]{20,}/ },
];

const findings = [];
let scanned = 0;

for (const file of files) {
  if (ignored.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue; // binario
  scanned += 1;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of patterns) {
      if (pattern.regex.test(lines[index])) {
        findings.push({ file, line: index + 1, pattern: pattern.name });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ secrets: 'failed', findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ secrets: 'ok', scanned, patterns: patterns.length }));
