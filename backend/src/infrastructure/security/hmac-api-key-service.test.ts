import { describe, expect, it } from 'vitest';
import { HmacApiKeyService } from './hmac-api-key-service.js';

describe('HmacApiKeyService', () => {
  it('genera prefijo/hash y verifica sólo el secreto correcto', () => {
    const service = new HmacApiKeyService({
      pepper: 'pepper-actual-32-caracteres-minimo!!',
      keyEnv: 'test',
    });
    const generated = service.generate();
    expect(generated.keyPrefix).toMatch(/^fsk_test_[a-z0-9]{8}$/);
    expect(generated.apiKey.startsWith(`${generated.keyPrefix}_`)).toBe(true);
    const secret = generated.apiKey.slice(generated.keyPrefix.length + 1);
    expect(service.verify(secret, generated.keyHash)).toBe(true);
    expect(service.verify(`${secret}x`, generated.keyHash)).toBe(false);
  });

  it('acepta el pepper anterior durante la rotación', () => {
    const previous = new HmacApiKeyService({
      pepper: 'pepper-anterior-32-caracteres-minimo',
      keyEnv: 'test',
    });
    const generated = previous.generate();
    const secret = generated.apiKey.slice(generated.keyPrefix.length + 1);
    const current = new HmacApiKeyService({
      pepper: 'pepper-nuevo-32-caracteres-minimo!!',
      previousPepper: 'pepper-anterior-32-caracteres-minimo',
      keyEnv: 'test',
    });
    expect(current.verify(secret, generated.keyHash)).toBe(true);
  });
});
