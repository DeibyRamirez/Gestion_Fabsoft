import { randomUUID } from 'node:crypto';
import type {
  AuthUserWithSecret,
  NewRefreshToken,
  RevokeReason,
} from '../../src/application/auth/ports.js';
import type { AuditEntry } from '../../src/application/shared/ports.js';
import type { UserView } from '../../src/application/users/shared/user-view.js';
import type { ProductView } from '../../src/application/products/shared/product-view.js';
import type { AuthScopeRepos, Infra, UserScopeRepos } from '../../src/composition/infra.js';
import { Sha256RefreshTokenFactory } from '../../src/infrastructure/security/sha256-refresh-token-factory.js';
import { JoseTokenService } from '../../src/infrastructure/security/jose-token-service.js';

/** Infra en memoria para tests de API/casos de uso (sin BD). Simula sólo lo que las reglas necesitan. */
export interface MemUser extends AuthUserWithSecret {
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
interface MemToken extends NewRefreshToken {
  revokedAt: Date | null;
  revokedReason: RevokeReason | null;
}

export const fakeHasher = {
  hash: async (p: string) => `h:${p}`,
  verify: async (h: string, p: string) => h === `h:${p}`,
};

export class MemoryStore {
  users = new Map<string, MemUser>();
  tokens: MemToken[] = [];
  audit: AuditEntry[] = [];
  dbUp = true;
  idem = new Map<
    string,
    {
      method: string;
      path: string;
      requestHash: string;
      responseStatus: number | null;
      responseBody: unknown;
      expiresAt: Date;
    }
  >();
  clients = new Set<string>(['00000000-0000-4000-8000-00000000c001']);
  products = new Map<string, ProductView>();

  addUser(p: Partial<MemUser> & Pick<MemUser, 'email' | 'role'> & { password: string }): MemUser {
    const now = new Date();
    const u: MemUser = {
      id: randomUUID(),
      fullName: p.fullName ?? p.email,
      clientId: p.clientId ?? null,
      status: p.status ?? 'active',
      mustChangePassword: p.mustChangePassword ?? false,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      email: p.email,
      role: p.role,
      passwordHash: `h:${p.password}`,
    };
    this.users.set(u.id, u);
    return u;
  }
}

const view = (u: MemUser): UserView => {
  const { passwordHash: _ignored, ...rest } = u;
  return rest;
};

export function memoryInfra(store = new MemoryStore()): Promise<Infra & { store: MemoryStore }> {
  const revoke = (pred: (t: MemToken) => boolean, reason: RevokeReason, at: Date) => {
    for (const t of store.tokens)
      if (!t.revokedAt && pred(t)) Object.assign(t, { revokedAt: at, revokedReason: reason });
  };
  const stored = (t: MemToken | undefined) =>
    t
      ? {
          id: t.id,
          userId: t.userId,
          familyId: t.familyId,
          expiresAt: t.expiresAt,
          revokedAt: t.revokedAt,
        }
      : null;
  const byHash = (h: string) => store.tokens.find((t) => t.tokenHash === h);
  const insert = async (t: NewRefreshToken) =>
    void store.tokens.push({ ...t, revokedAt: null, revokedReason: null });
  const auth = (id: string) => {
    const u = store.users.get(id);
    return u ? view(u) : null;
  };
  const audit = { write: async (e: AuditEntry) => void store.audit.push(e) };

  const authRepos: AuthScopeRepos = {
    audit,
    login: {
      findByEmail: async (email) =>
        [...store.users.values()].find((u) => u.email === email.toLowerCase()) ?? null,
      recordSuccessfulLogin: async (id, at) => void (store.users.get(id)!.lastLoginAt = at),
      createRefreshToken: insert,
    },
    refresh: {
      findByHashForUpdate: async (h) => stored(byHash(h)),
      loadUser: async (id) => auth(id),
      rotate: async (oldId, repl, at) => {
        await insert(repl);
        revoke((t) => t.id === oldId, 'rotated', at);
      },
      revokeFamily: async (f, r, at) => revoke((t) => t.familyId === f, r, at),
    },
    logout: {
      findByHash: async (h) => stored(byHash(h)),
      revokeFamily: async (f, r, at) => revoke((t) => t.familyId === f, r, at),
    },
    authenticate: { loadUser: async (id) => auth(id) },
    idempotencyRelease: {
      release: async (actorId, key) => {
        if (store.idem.get(`${actorId}|${key}`)?.responseStatus === null)
          store.idem.delete(`${actorId}|${key}`);
      },
    },
  };

  const idemRow = (r: { method: string; path: string; requestHash: string }) => ({
    method: r.method,
    path: r.path,
    requestHash: r.requestHash,
    responseStatus: null,
    responseBody: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const userRepos: UserScopeRepos = {
    audit,
    idempotency: {
      tryInsert: async (r) => {
        const k = `${r.actorId}|${r.key}`;
        if (store.idem.has(k)) return false;
        store.idem.set(k, idemRow(r));
        return true;
      },
      find: async (actorId, key) => {
        const row = store.idem.get(`${actorId}|${key}`);
        return row ? { ...row, expired: row.expiresAt <= new Date() } : null;
      },
      restart: async (r) => void store.idem.set(`${r.actorId}|${r.key}`, idemRow(r)),
      saveResponse: async (actorId, key, status, body) =>
        void Object.assign(store.idem.get(`${actorId}|${key}`)!, {
          responseStatus: status,
          responseBody: JSON.parse(JSON.stringify(body ?? null)),
        }),
    },
    password: {
      loadWithSecret: async (id) => store.users.get(id) ?? null,
      updatePassword: async (id, hash) =>
        void Object.assign(store.users.get(id)!, { passwordHash: hash, mustChangePassword: false }),
    },
    // Simula app.revoke_user_sessions (0005), en la misma "transacción".
    sessions: {
      revokeAllForUser: async (id, r, except) => {
        const keep = except ? byHash(except)?.familyId : undefined;
        revoke((t) => t.userId === id && t.familyId !== keep, r, new Date());
      },
    },
    me: { findProfile: async (id) => auth(id) },
    usersList: {
      list: async (q) => {
        const all = [...store.users.values()].filter(
          (u) =>
            (!q.role?.length || q.role.includes(u.role)) && (!q.status || u.status === q.status),
        );
        return {
          items: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map(view),
          total: all.length,
        };
      },
    },
    userDetail: {
      findById: async (id) => (store.users.get(id) ? view(store.users.get(id)!) : null),
    },
    userCreate: {
      insert: async (n) => {
        if ([...store.users.values()].some((u) => u.email === n.email))
          return { ok: false, reason: 'duplicate_email' };
        if (n.clientId && !store.clients.has(n.clientId))
          return { ok: false, reason: 'unknown_client' };
        const u = store.addUser({
          email: n.email,
          role: n.role,
          clientId: n.clientId,
          fullName: n.fullName,
          password: '',
          mustChangePassword: true,
        });
        u.passwordHash = n.passwordHash;
        return { ok: true, user: view(u) };
      },
    },
    userUpdate: {
      loadForUpdate: async (id) => (store.users.get(id) ? view(store.users.get(id)!) : null),
      countActiveAdmins: async () =>
        [...store.users.values()].filter((u) => u.role === 'admin' && u.status === 'active').length,
      save: async (id, p) => {
        const u = store.users.get(id)!;
        Object.assign(
          u,
          { role: p.role, clientId: p.clientId, status: p.status, updatedAt: new Date() },
          p.fullName ? { fullName: p.fullName } : {},
        );
        return view(u);
      },
    },
    userPasswordReset: {
      setTemporaryPassword: async (id, hash) => {
        const u = store.users.get(id);
        if (!u) return false;
        Object.assign(u, { passwordHash: hash, mustChangePassword: true });
        return true;
      },
    },
    productsList: {
      list: async (q) => {
        const all = [...store.products.values()].filter(
          (p) =>
            (!q.productType?.length || q.productType.includes(p.productType)) &&
            (!q.status || p.status === q.status),
        );
        return {
          items: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
          total: all.length,
        };
      },
    },
    productDetail: {
      findById: async (id) => store.products.get(id) ?? null,
    },
    productCreate: {
      insert: async (n) => {
        const key = `${n.name.toLowerCase()}|${(n.vendor ?? '').toLowerCase()}`;
        if ([...store.products.values()].some(
          (p) => `${p.name.toLowerCase()}|${(p.vendor ?? '').toLowerCase()}` === key,
        ))
          return { ok: false, reason: 'duplicate_product' };
        const now = new Date();
        const product: ProductView = {
          id: randomUUID(),
          name: n.name,
          description: n.description,
          productType: n.productType,
          vendor: n.vendor,
          referenceCode: n.referenceCode,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        store.products.set(product.id, product);
        return { ok: true, product };
      },
    },
    productUpdate: {
      loadForUpdate: async (id) => store.products.get(id) ?? null,
      save: async (id, p) => {
        const current = store.products.get(id);
        if (!current) return { ok: false, reason: 'duplicate_product' };
        const next: ProductView = {
          ...current,
          ...(p.name !== undefined ? { name: p.name } : {}),
          ...(p.description !== undefined ? { description: p.description } : {}),
          ...(p.productType !== undefined ? { productType: p.productType } : {}),
          ...(p.vendor !== undefined ? { vendor: p.vendor } : {}),
          ...(p.referenceCode !== undefined ? { referenceCode: p.referenceCode } : {}),
          ...(p.status !== undefined ? { status: p.status } : {}),
          updatedAt: new Date(),
        };
        const key = `${next.name.toLowerCase()}|${(next.vendor ?? '').toLowerCase()}`;
        if (
          [...store.products.entries()].some(
            ([pid, prod]) =>
              pid !== id &&
              `${prod.name.toLowerCase()}|${(prod.vendor ?? '').toLowerCase()}` === key,
          )
        )
          return { ok: false, reason: 'duplicate_product' };
        store.products.set(id, next);
        return { ok: true, product: next };
      },
    },
  };

  return JoseTokenService.ephemeral({
    activeKid: 'test',
    issuer: 'fabsoft-api',
    audience: 'fabsoft-web',
    ttlSeconds: 900,
  }).then((tokens) => ({
    store,
    userUow: { run: (_actor, work) => work(userRepos) },
    authUow: { run: (_rid, work) => work(authRepos) },
    workerUow: { run: (_rid, work) => work({ idempotency: { purgeExpired: async () => 0 } }) },
    hasher: fakeHasher,
    tokens,
    refreshTokens: new Sha256RefreshTokenFactory(),
    passwords: { generate: () => 'temporary-password-0001' },
    clock: { now: () => new Date() },
    ids: { uuid: () => randomUUID() },
    dummyHash: 'h:__dummy__',
    refreshTokenTtlDays: 14,
    readinessChecks: [{ name: 'database', check: async () => store.dbUp }],
    close: async () => undefined,
  }));
}
