/** Genera un par Ed25519 y lo imprime en formato .env (JWT_PRIVATE_KEY, JWT_PUBLIC_KEYS, JWT_ACTIVE_KID). */
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';

const kid = process.argv[2] ?? new Date().toISOString().slice(0, 7);
const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
  crv: 'Ed25519',
  extractable: true,
});
const pem = (await exportPKCS8(privateKey)).trim().replace(/\n/g, '\\n');
const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA', use: 'sig' };
console.log(`JWT_ACTIVE_KID=${kid}`);
console.log(`JWT_PRIVATE_KEY="${pem}"`);
console.log(`JWT_PUBLIC_KEYS='${JSON.stringify({ keys: [jwk] })}'`);
