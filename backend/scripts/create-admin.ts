/**
 * Alta del PRIMER admin vía app.bootstrap_first_admin() (0005, SECURITY DEFINER), conectando con
 * BOOTSTRAP_DATABASE_URL (rol fabsoft_bootstrap; sin propietario ni BYPASSRLS).
 * La contraseña temporal NO se escribe en stdout (logs persistentes): va a la terminal (stderr TTY)
 * o, si no hay TTY, a un archivo 0600 cuyo path se informa.
 *   pnpm --filter @fabsoft/backend admin:create --email admin@empresa.co --name "Nombre"
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { Argon2PasswordHasher } from '../src/infrastructure/security/argon2-password-hasher.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
const url = process.env.BOOTSTRAP_DATABASE_URL;
if (!values.email || !values.name || !url) {
  console.error('Requiere --email, --name y BOOTSTRAP_DATABASE_URL (rol fabsoft_bootstrap)');
  process.exit(1);
}

const temporary = randomBytes(18).toString('base64url');
const hash = await new Argon2PasswordHasher().hash(temporary);
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query<{ id: string }>(
    'select app.bootstrap_first_admin($1, $2, $3) as id',
    [values.email, values.name, hash],
  );
  console.log(
    JSON.stringify({
      msg: 'admin.bootstrapped',
      id: rows[0]?.id,
      email: values.email.toLowerCase(),
    }),
  );
  if (process.stderr.isTTY) {
    process.stderr.write(
      `Contraseña temporal (se muestra una vez, cambio obligatorio): ${temporary}\n`,
    );
  } else {
    const file = join(tmpdir(), `fabsoft-admin-${Date.now()}.txt`);
    writeFileSync(file, `${temporary}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ msg: 'admin.temporary_password_file', file }));
  }
} catch (err) {
  if ((err as { code?: string }).code === '42501') {
    console.error(
      'Ya existe un administrador: el bootstrap está deshabilitado. Use POST /api/v1/users con un admin.',
    );
    process.exitCode = 2;
  } else {
    throw err;
  }
} finally {
  await client.end();
}
