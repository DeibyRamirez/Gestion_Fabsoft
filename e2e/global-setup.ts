import { execSync } from 'node:child_process';

/**
 * Prepara alertas para el flujo E2E. El seed crea las suscripciones y reglas;
 * la reconciliación genera las notificaciones como lo haría el worker.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env['E2E_SKIP_RECONCILE'] === '1') return;
  execSync('pnpm --filter @fabsoft/backend alerts:reconcile', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
}
