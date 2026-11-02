/** Aborta scripts de datos en producción o contra hosts prohibidos (docs/seed-data.md). */
export function assertNonProduction(): void {
  if (process.env.APP_ENV === 'prod') throw new Error('Prohibido en APP_ENV=prod');
  const url = process.env.DATABASE_MIGRATION_URL;
  const forbidden = (process.env.SEED_FORBIDDEN_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (url && forbidden.includes(new URL(url).hostname))
    throw new Error(`Host prohibido: ${new URL(url).hostname}`);
}
