/**
 * T-F0-05: detecta bypass de owner-system / getOwnerPool en código de test.
 */
const OWNER_SYSTEM_PATH = /owner-system(?:\.js)?/;
const WITH_OWNER = /\bwithOwnerSystemContext\b/;
const GET_OWNER_POOL = /\bgetOwnerPool\b/;

/** Referencias estáticas o dinámicas al módulo owner-system (cualquier ruta relativa). */
function referencesOwnerSystemModule(body: string): boolean {
  if (OWNER_SYSTEM_PATH.test(body)) return true;
  const importPatterns = [
    /from\s+['"][^'"]*owner-system[^'"]*['"]/,
    /export\s+\*\s+from\s+['"][^'"]*owner-system[^'"]*['"]/,
    /export\s+\{[^}]*\}\s+from\s+['"][^'"]*owner-system[^'"]*['"]/,
    /import\s*\(\s*['"][^'"]*owner-system[^'"]*['"]\s*\)/,
    /import\s*\(\s*[^)]*\+[^)]*owner-system/,
    /import\s*\(\s*['"`][^'"`]*['"`]\s*\+\s*['"][^'"]*owner-system/,
    /require\s*\(\s*['"][^'"]*owner-system[^'"]*['"]\s*\)/,
  ];
  return importPatterns.some((re) => re.test(body));
}

export function detectsOwnerBypassInTestSource(body: string): boolean {
  if (GET_OWNER_POOL.test(body)) return true;
  if (referencesOwnerSystemModule(body)) return true;
  if (WITH_OWNER.test(body)) return true;
  return false;
}
