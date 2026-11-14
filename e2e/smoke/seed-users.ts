import fs from 'node:fs';
import path from 'node:path';

/** Cuentas y contraseñas leídas de `docs/seed-data.md` (sin literales en código). */

type SeedUserRef = { file: string; email: string };

function loadPasswordByEmail(): Map<string, string> {
  const md = fs.readFileSync(path.join(process.cwd(), 'docs/seed-data.md'), 'utf8');
  const map = new Map<string, string>();
  for (const line of md.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 4) continue;
    const email = cells[0].replace(/`/g, '');
    const password = cells[3].replace(/`/g, '');
    if (email.includes('@') && password.length > 0) map.set(email, password);
  }
  return map;
}

let passwordByEmail: Map<string, string> | null = null;

function seedPassword(email: string): string {
  passwordByEmail ??= loadPasswordByEmail();
  const password = passwordByEmail.get(email);
  if (!password) {
    throw new Error(`Contraseña no encontrada en docs/seed-data.md para ${email}`);
  }
  return password;
}

function withPassword(ref: SeedUserRef) {
  return {
    ...ref,
    get password() {
      return seedPassword(ref.email);
    },
  };
}

export const seedUsers = {
  admin: withPassword({ file: 'admin.json', email: 'admin@fabsoft.test' }),
  operator: withPassword({ file: 'operator.json', email: 'operador@fabsoft.test' }),
  client: withPassword({ file: 'client.json', email: 'portal@andina.test' }),
  clientMustChange: withPassword({ file: 'client-must-change.json', email: 'portal@cafetal.test' }),
  inactive: withPassword({ file: '', email: 'inactivo@fabsoft.test' }),
} as const;
