import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JSONWebKeySet,
  type JWK,
} from 'jose';
import { randomUUID } from 'node:crypto';
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedAccessToken,
} from '../../application/auth/ports.js';
import { ApplicationError } from '../../application/shared/application-error.js';

export interface JoseSettings {
  privateKey: CryptoKey;
  jwks: JSONWebKeySet;
  activeKid: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

const ROLES = new Set(['admin', 'operator', 'client']);

/** JWT EdDSA (Ed25519) con `kid` y JWKS para rotación (ADR-001). */
export class JoseTokenService implements AccessTokenService {
  private readonly keySet: ReturnType<typeof createLocalJWKSet>;

  constructor(private readonly settings: JoseSettings) {
    this.keySet = createLocalJWKSet(settings.jwks);
  }

  static async fromPem(
    pem: string,
    jwksJson: string,
    rest: Omit<JoseSettings, 'privateKey' | 'jwks'>,
  ) {
    const privateKey = await importPKCS8(pem.replace(/\\n/g, '\n'), 'EdDSA');
    return new JoseTokenService({
      ...rest,
      privateKey,
      jwks: JSON.parse(jwksJson) as JSONWebKeySet,
    });
  }

  /** Par efímero para dev/test cuando no hay claves configuradas. */
  static async ephemeral(rest: Omit<JoseSettings, 'privateKey' | 'jwks'>) {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    const jwk: JWK = {
      ...(await exportJWK(publicKey)),
      kid: rest.activeKid,
      alg: 'EdDSA',
      use: 'sig',
    };
    return new JoseTokenService({ ...rest, privateKey, jwks: { keys: [jwk] } });
  }

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const jwt = new SignJWT({
      role: claims.role,
      ...(claims.clientId ? { cid: claims.clientId } : {}),
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.settings.activeKid, typ: 'JWT' })
      .setIssuer(this.settings.issuer)
      .setAudience(this.settings.audience)
      .setSubject(claims.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.settings.ttlSeconds}s`);
    return { token: await jwt.sign(this.settings.privateKey), expiresIn: this.settings.ttlSeconds };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keySet, {
        issuer: this.settings.issuer,
        audience: this.settings.audience,
        algorithms: ['EdDSA'],
        typ: 'JWT',
      });
      const role = payload['role'];
      if (!payload.sub || typeof role !== 'string' || !ROLES.has(role))
        throw new Error('claims inválidos');
      const cid = payload['cid'];
      return {
        userId: payload.sub,
        role: role as AccessTokenClaims['role'],
        clientId: typeof cid === 'string' ? cid : null,
      };
    } catch (err) {
      if (err instanceof errors.JWTExpired)
        throw new ApplicationError('token_expired', 'Token expirado');
      throw new ApplicationError('unauthenticated', 'Token inválido');
    }
  }
}
