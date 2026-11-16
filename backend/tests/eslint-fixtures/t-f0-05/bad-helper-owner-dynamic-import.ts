/** Fixture ESLint T-F0-05 (debe fallar lint): wrapper import() literal hacia owner-system. */
export async function loadOwner(): Promise<unknown> {
  return import('../../helpers/owner-system.js');
}
