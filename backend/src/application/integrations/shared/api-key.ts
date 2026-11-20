export interface GeneratedApiKey {
  apiKey: string;
  keyPrefix: string;
  keyHash: string;
}

/** Puerto de generación/verificación de API keys (implementado en infrastructure). */
export interface ApiKeyService {
  generate(): GeneratedApiKey;
  verify(secret: string, keyHash: string): boolean;
}

const API_KEY_RE = /^(fsk_(?:live|test)_[a-z0-9]{8})_(.+)$/;

export function parseApiKey(value: string): { keyPrefix: string; secret: string } | null {
  const match = API_KEY_RE.exec(value);
  if (!match) return null;
  return { keyPrefix: match[1]!, secret: match[2]! };
}
