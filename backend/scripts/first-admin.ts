/**
 * Alta interactiva del PRIMER administrador.
 *
 * No crea datos seed y no escribe la contraseña en disco ni en logs: sólo
 * calcula el hash Argon2id y lo inyecta en app.bootstrap_first_admin().
 *
 * Uso:
 *   pnpm --filter @fabsoft/backend primeradmin:db
 *
 * Conexión:
 *   - BOOTSTRAP_DATABASE_URL (rol fabsoft_bootstrap), o
 *   - DATABASE_PROVISION_URL / DATABASE_MIGRATION_URL + SET ROLE fabsoft_bootstrap.
 */
import { createInterface } from 'node:readline';
import { createInterface as createPromptInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { z } from 'zod';
import pg from 'pg';
import { Argon2PasswordHasher } from '../src/infrastructure/security/argon2-password-hasher.js';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;

function sslOptions(): pg.ClientConfig['ssl'] | undefined {
  const mode = process.env.DATABASE_SSL_MODE ?? 'disable';
  if (mode === 'disable') return undefined;
  if (mode === 'require') return { rejectUnauthorized: false };
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n');
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

async function prompt(question: string): Promise<string> {
  const rl = createPromptInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      reject(
        new Error('Este comando requiere una terminal interactiva para ocultar la contraseña.'),
      );
      return;
    }
    const rl = createInterface({ input, output, terminal: true });
    const writable = rl as unknown as { _writeToOutput: (value: string) => void };
    const original = writable._writeToOutput.bind(rl);
    output.write(question);
    writable._writeToOutput = () => undefined;
    rl.question('', (answer) => {
      writable._writeToOutput = original;
      output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  if (!input.isTTY) {
    throw new Error('Ejecuta este comando en una terminal interactiva.');
  }

  const email = (await prompt('Correo del primer admin: ')).toLowerCase();
  const fullName = await prompt('Nombre completo: ');
  const password = await promptHidden('Contraseña: ');
  const confirmation = await promptHidden('Confirmar contraseña: ');

  const emailResult = z.string().email().max(254).safeParse(email);
  if (!emailResult.success) throw new Error('Correo inválido.');
  if (fullName.length < 2 || fullName.length > 200) {
    throw new Error('El nombre completo debe tener entre 2 y 200 caracteres.');
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
    );
  }
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');

  const bootstrapUrl = process.env.BOOTSTRAP_DATABASE_URL?.trim();
  const ownerUrl =
    process.env.DATABASE_PROVISION_URL?.trim() ?? process.env.DATABASE_MIGRATION_URL?.trim();
  if (!bootstrapUrl && !ownerUrl) {
    throw new Error(
      'Configura BOOTSTRAP_DATABASE_URL (rol fabsoft_bootstrap) o DATABASE_PROVISION_URL.',
    );
  }

  const hash = await new Argon2PasswordHasher().hash(password);
  const client = new pg.Client({
    connectionString: bootstrapUrl ?? ownerUrl,
    ...(sslOptions() ? { ssl: sslOptions() } : {}),
  });
  await client.connect();

  try {
    let id: string | undefined;

    if (bootstrapUrl) {
      const { rows } = await client.query<{ id: string }>(
        'select app.bootstrap_first_admin($1, $2, $3) as id',
        [email, fullName, hash],
      );
      id = rows[0]?.id;
    } else {
      await client.query('begin');
      try {
        await client.query('set local role fabsoft_bootstrap');
        const { rows } = await client.query<{ id: string }>(
          'select app.bootstrap_first_admin($1, $2, $3) as id',
          [email, fullName, hash],
        );
        id = rows[0]?.id;
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      }
    }

    console.log(
      JSON.stringify({
        msg: 'admin.bootstrapped',
        id,
        email,
        mustChangePassword: true,
      }),
    );
  } catch (error) {
    if ((error as { code?: string }).code === '42501') {
      console.error(
        'Ya existe un administrador o la sesión no puede asumir fabsoft_bootstrap. ' +
          'Verifica que la base esté limpia y que el rol de migración sea miembro de fabsoft_bootstrap.',
      );
      process.exitCode = 2;
      return;
    }
    throw error;
  } finally {
    await client.end();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
