/**
 * T-F0-05: respaldo alineado con eslint.f0-05.js (owner-system / getOwnerPool / import() no literal).
 */
const OWNER_SYSTEM_PATH = /owner-system(?:\.js|\.ts)?/;
const WITH_OWNER = /\bwithOwnerSystemContext\b/;
const GET_OWNER_POOL = /\bgetOwnerPool\b/;

function referencesOwnerSystemModule(body: string): boolean {
  if (OWNER_SYSTEM_PATH.test(body)) return true;
  return [
    /from\s+['"][^'"]*owner-system[^'"]*['"]/,
    /export\s+\*\s+from\s+['"][^'"]*owner-system[^'"]*['"]/,
    /export\s+\{[^}]*\}\s+from\s+['"][^'"]*owner-system[^'"]*['"]/,
    /export\s+\{[^}]*\bwithOwnerSystemContext\b[^}]*\}/,
    /import\s*\(\s*['"][^'"]*owner-system[^'"]*['"]\s*\)/,
    /import\s*\(\s*[^)]*\+[^)]*\)/,
    /require\s*\(\s*['"][^'"]*owner-system[^'"]*['"]\s*\)/,
  ].some((re) => re.test(body));
}

/** import() con expresión no literal (clave computada, concatenación, variable). */
export function hasNonLiteralDynamicImport(body: string): boolean {
  const re = /\bimport\s*\(\s*([^)]+)\)/g;
  for (const m of body.matchAll(re)) {
    const arg = m[1]!.trim();
    if (!/^['"`][^'"`]*['"`]$/.test(arg)) return true;
    if (/\+/.test(arg)) return true;
    if (/`[^`]*\$\{/.test(arg)) return true;
  }
  return false;
}

export function detectsOwnerBypassInTestSource(body: string): boolean {
  if (GET_OWNER_POOL.test(body)) return true;
  if (referencesOwnerSystemModule(body)) return true;
  if (WITH_OWNER.test(body)) return true;
  if (hasNonLiteralDynamicImport(body)) return true;
  return false;
}
