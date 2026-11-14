/** Fixture ESLint T-F0-05 (debe fallar lint): import() no literal en archivo test. */
const segment = 'owner-system.js';

export async function evasion(): Promise<void> {
  const m = await import(`../../helpers/${segment}`);
  await m.withOwnerSystemContext(async () => undefined);
}
