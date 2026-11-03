/**
 * Carga backend/.env (si existe) y ejecuta el comando que sigue a `--`.
 * Uso: node scripts/with-env.mjs -- dbmate ...
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(backendRoot, '.env');

if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const sep = process.argv.indexOf('--');
if (sep === -1 || sep === process.argv.length - 1) {
  console.error('Uso: node scripts/with-env.mjs -- <comando> [args...]');
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(sep + 1);

function resolveCommand(name) {
  if (name !== 'dbmate') return name;
  const bin = process.platform === 'win32' ? 'dbmate.cmd' : 'dbmate';
  return join(backendRoot, 'node_modules', '.bin', bin);
}

const executable = resolveCommand(cmd);
const result = spawnSync(executable, args, {
  stdio: 'inherit',
  env: process.env,
  shell: false,
  cwd: backendRoot,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
