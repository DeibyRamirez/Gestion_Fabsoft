import { randomBytes } from 'node:crypto';
import type { TemporaryPasswordGenerator } from '../../application/users/shared/ports.js';

/** 18 bytes aleatorios → 24 caracteres base64url (≥16 exigidos por el contrato). */
export class RandomTemporaryPasswordGenerator implements TemporaryPasswordGenerator {
  generate(): string {
    return randomBytes(18).toString('base64url');
  }
}
