import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ApiKeyService, GeneratedApiKey } from '../../application/integrations/shared/api-key.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomPrefix(): string {
  const bytes = randomBytes(8);
  let value = '';
  for (const byte of bytes) value += ALPHABET[byte % ALPHABET.length];
  return value;
}

export class HmacApiKeyService implements ApiKeyService {
  constructor(
    private readonly options: {
      pepper: string;
      previousPepper?: string | undefined;
      keyEnv: 'live' | 'test';
    },
  ) {}

  private hash(secret: string, pepper: string): string {
    return createHmac('sha256', pepper).update(secret).digest('hex');
  }

  generate(): GeneratedApiKey {
    const keyPrefix = `fsk_${this.options.keyEnv}_${randomPrefix()}`;
    const secret = randomBytes(24).toString('base64url');
    return {
      apiKey: `${keyPrefix}_${secret}`,
      keyPrefix,
      keyHash: this.hash(secret, this.options.pepper),
    };
  }

  verify(secret: string, keyHash: string): boolean {
    const expected = this.hash(secret, this.options.pepper);
    const candidates = [expected];
    if (this.options.previousPepper) {
      candidates.push(this.hash(secret, this.options.previousPepper));
    }
    for (const candidate of candidates) {
      const left = Buffer.from(candidate, 'hex');
      const right = Buffer.from(keyHash, 'hex');
      if (left.length === right.length && timingSafeEqual(left, right)) return true;
    }
    return false;
  }
}
