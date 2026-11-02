import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenFactory } from '../../application/auth/ports.js';

/** Refresh opaco de 32 bytes base64url; en BD sólo SHA-256 hex (ADR-001). */
export class Sha256RefreshTokenFactory implements RefreshTokenFactory {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
