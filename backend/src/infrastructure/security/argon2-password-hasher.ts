import argon2 from 'argon2';
import type { PasswordHasher } from '../../application/auth/ports.js';

/** argon2id con parámetros mínimos OWASP (ADR-001). */
export class Argon2PasswordHasher implements PasswordHasher {
  private static readonly OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, Argon2PasswordHasher.OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
