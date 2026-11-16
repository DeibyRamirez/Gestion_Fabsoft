import { randomUUID } from 'node:crypto';
import type { AuditLogListQuery } from '@fabsoft/shared';
import type { AuditLogView } from '../../src/application/audit/shared/audit-log-view.js';
import type {
  AuthUserWithSecret,
  NewRefreshToken,
  RevokeReason,
} from '../../src/application/auth/ports.js';
import type { AuditEntry } from '../../src/application/shared/ports.js';
import type { UserView } from '../../src/application/users/shared/user-view.js';
import type { ClientView } from '../../src/application/clients/shared/client-view.js';
import type { ClientContactView } from '../../src/application/clients/shared/client-contact-view.js';
import type { NewSubscriptionRecord } from '../../src/application/subscriptions/create-subscription/ports.js';
import type { SubscriptionView } from '../../src/application/subscriptions/shared/subscription-view.js';
import type { RenewSubscriptionParams } from '../../src/application/subscriptions/renew-subscription/ports.js';
import type { SubscriptionPatch } from '../../src/application/subscriptions/update-subscription/ports.js';
import { ApplicationError } from '../../src/application/shared/application-error.js';
import type { ProductView } from '../../src/application/products/shared/product-view.js';
import { normalizeTaxId } from '../../src/domain/clients/tax-id.js';
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
  clientRows = new Map<string, ClientView>();
  contacts = new Map<string, ClientContactView>();
  subscriptions = new Map<string, SubscriptionView>();
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

  const auditLogs = (): AuditLogView[] =>
    store.audit.map((e, i) => ({
      id: String(i + 1),
      occurredAt: new Date(),
      actorType: e.actor.type,
      actor: e.actor.type === 'user' ? { id: e.actor.userId, name: e.actor.userId } : null,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      clientId: null,
      changes: (e.changes as Record<string, unknown> | undefined) ?? null,
      reason: null,
      requestId: e.requestId,
    }));

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
    auditLogs: {
      list: async (query: AuditLogListQuery) => {
        const filtered = auditLogs().filter(
          (a) =>
            (!query.actorType || a.actorType === query.actorType) &&
            (!query.actorId || a.actor?.id === query.actorId) &&
            (!query.action || a.action === query.action) &&
            (!query.resourceType || a.resourceType === query.resourceType) &&
            (!query.resourceId || a.resourceId === query.resourceId) &&
            (!query.clientId || a.clientId === query.clientId),
        );
        return {
          items: filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
          total: filtered.length,
        };
      },
    },
    clientActivity: {
      listForClient: async () => ({ items: [], total: 0 }),
    },
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
        if (
          [...store.products.values()].some(
            (p) => `${p.name.toLowerCase()}|${(p.vendor ?? '').toLowerCase()}` === key,
          )
        )
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
    clientsList: {
      list: async (q) => {
        const all = [...store.clientRows.values()].filter(
          (c) =>
            (!q.status.length || q.status.includes(c.status)) &&
            (!q.taxId || (c.taxId && normalizeTaxId(c.taxId) === normalizeTaxId(q.taxId))),
        );
        return {
          items: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
          total: all.length,
        };
      },
    },
    clientDetail: {
      findById: async (id) => store.clientRows.get(id) ?? null,
    },
    clientCreate: {
      findByTaxIdNormalized: async (normalized) => {
        for (const c of store.clientRows.values()) {
          if (c.taxId && normalizeTaxId(c.taxId) === normalized) {
            return { id: c.id, status: c.status };
          }
        }
        return null;
      },
      insert: async (n) => {
        if (n.taxId) {
          const normalized = normalizeTaxId(n.taxId);
          const dup = [...store.clientRows.values()].find(
            (c) => c.taxId && normalizeTaxId(c.taxId) === normalized,
          );
          if (dup) {
            return {
              ok: false,
              reason: 'client_tax_id_taken',
              conflict: { existingClientId: dup.id, archived: dup.status === 'archived' },
            };
          }
        }
        const now = new Date();
        const client: ClientView = {
          id: randomUUID(),
          legalName: n.legalName,
          taxId: n.taxId,
          status: n.status,
          email: n.email,
          phone: n.phone,
          owner: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        store.clientRows.set(client.id, client);
        store.clients.add(client.id);
        return { ok: true, client };
      },
    },
    clientUpdate: {
      loadForUpdate: async (id) => store.clientRows.get(id) ?? null,
      findByTaxIdNormalized: async (normalized, excludeId) => {
        for (const c of store.clientRows.values()) {
          if (c.id === excludeId) continue;
          if (c.taxId && normalizeTaxId(c.taxId) === normalized) {
            return { id: c.id, status: c.status };
          }
        }
        return null;
      },
      save: async (id, p) => {
        const current = store.clientRows.get(id);
        if (!current)
          return {
            ok: false,
            reason: 'client_tax_id_taken',
            conflict: { existingClientId: id, archived: false },
          };
        const next: ClientView = {
          ...current,
          ...(p.legalName !== undefined ? { legalName: p.legalName } : {}),
          ...(p.taxId !== undefined ? { taxId: p.taxId } : {}),
          ...(p.email !== undefined ? { email: p.email } : {}),
          ...(p.phone !== undefined ? { phone: p.phone } : {}),
          ...(p.status !== undefined ? { status: p.status } : {}),
          updatedAt: new Date(),
        };
        if (next.taxId) {
          const normalized = normalizeTaxId(next.taxId);
          const dup = [...store.clientRows.values()].find(
            (c) => c.id !== id && c.taxId && normalizeTaxId(c.taxId) === normalized,
          );
          if (dup) {
            return {
              ok: false,
              reason: 'client_tax_id_taken',
              conflict: { existingClientId: dup.id, archived: dup.status === 'archived' },
            };
          }
        }
        store.clientRows.set(id, next);
        return { ok: true, client: next };
      },
    },
    clientArchive: {
      loadForUpdate: async (id) => store.clientRows.get(id) ?? null,
      archive: async (id, archivedAt) => {
        const c = store.clientRows.get(id)!;
        const next = { ...c, status: 'archived' as const, archivedAt, updatedAt: new Date() };
        store.clientRows.set(id, next);
        return next;
      },
    },
    clientReactivate: {
      loadForUpdate: async (id) => store.clientRows.get(id) ?? null,
      reactivate: async (id) => {
        const c = store.clientRows.get(id)!;
        const next = {
          ...c,
          status: 'active' as const,
          archivedAt: null,
          updatedAt: new Date(),
        };
        store.clientRows.set(id, next);
        return next;
      },
    },
    clientContactsList: {
      list: async (clientId, includeArchived) =>
        [...store.contacts.values()]
          .filter((c) => c.clientId === clientId && (includeArchived || c.archivedAt === null))
          .sort((a, b) =>
            a.isPrimary === b.isPrimary
              ? a.fullName.localeCompare(b.fullName)
              : a.isPrimary
                ? -1
                : 1,
          ),
    },
    clientContactCreate: {
      countActive: async (clientId) =>
        [...store.contacts.values()].filter((c) => c.clientId === clientId && c.archivedAt === null)
          .length,
      clearPrimary: async (clientId) => {
        for (const c of store.contacts.values()) {
          if (c.clientId === clientId && c.isPrimary && c.archivedAt === null) c.isPrimary = false;
        }
      },
      insert: async (n) => {
        if (
          n.isPrimary &&
          [...store.contacts.values()].some(
            (c) => c.clientId === n.clientId && c.isPrimary && c.archivedAt === null,
          )
        ) {
          throw new ApplicationError('primary_contact_conflict', 'Ya tiene contacto principal');
        }
        const contact: ClientContactView = {
          id: randomUUID(),
          clientId: n.clientId,
          fullName: n.fullName,
          email: n.email,
          phone: n.phone,
          roleTitle: n.roleTitle,
          isPrimary: n.isPrimary,
          archivedAt: null,
        };
        store.contacts.set(contact.id, contact);
        return contact;
      },
    },
    clientContactUpdate: {
      loadForUpdate: async (clientId, contactId) => {
        const c = store.contacts.get(contactId);
        return c && c.clientId === clientId ? c : null;
      },
      countOtherActive: async (clientId, contactId) =>
        [...store.contacts.values()].filter(
          (c) => c.clientId === clientId && c.id !== contactId && c.archivedAt === null,
        ).length,
      countOtherPrimary: async (clientId, contactId) =>
        [...store.contacts.values()].filter(
          (c) =>
            c.clientId === clientId && c.id !== contactId && c.isPrimary && c.archivedAt === null,
        ).length,
      clearPrimary: async (clientId) => {
        for (const c of store.contacts.values()) {
          if (c.clientId === clientId && c.isPrimary && c.archivedAt === null) c.isPrimary = false;
        }
      },
      save: async (contactId, p) => {
        const current = store.contacts.get(contactId)!;
        const next: ClientContactView = {
          ...current,
          ...(p.fullName !== undefined ? { fullName: p.fullName } : {}),
          ...(p.email !== undefined ? { email: p.email } : {}),
          ...(p.phone !== undefined ? { phone: p.phone } : {}),
          ...(p.roleTitle !== undefined ? { roleTitle: p.roleTitle } : {}),
          ...(p.isPrimary !== undefined ? { isPrimary: p.isPrimary } : {}),
          ...(p.archivedAt !== undefined ? { archivedAt: p.archivedAt } : {}),
        };
        if (
          next.isPrimary &&
          next.archivedAt === null &&
          [...store.contacts.values()].some(
            (c) =>
              c.id !== contactId &&
              c.clientId === next.clientId &&
              c.isPrimary &&
              c.archivedAt === null,
          )
        ) {
          throw new ApplicationError('primary_contact_conflict', 'Ya tiene contacto principal');
        }
        store.contacts.set(contactId, next);
        return next;
      },
    },
    subscriptionCreate: {
      insert: async (r: NewSubscriptionRecord) => {
        const id = randomUUID();
        const now = new Date();
        const view: SubscriptionView = {
          id,
          clientId: r.clientId,
          productId: r.productId,
          client: { id: r.clientId, legalName: '' },
          product: { id: r.productId, name: '' },
          contractReference: r.contractReference,
          startDate: r.startDate,
          currentPeriodEnd: r.currentPeriodEnd,
          billingCycle: r.billingCycle,
          customCycleMonths: r.customCycleMonths,
          priceAmount: r.priceAmount,
          currency: r.currency,
          supplierCostAmount: r.supplierCostAmount,
          renewalTerms: r.renewalTerms,
          isRenewable: r.isRenewable,
          status: r.status,
          followUpStatus: 'none',
          visibleInPortal: r.visibleInPortal,
          ownerUserId: r.ownerUserId,
          owner: null,
          notes: r.notes,
          cancelledAt: null,
          cancellationReason: null,
          version: 1,
          currentPeriod: {
            id: randomUUID(),
            periodNumber: r.initialPeriod.periodNumber,
            startDate: r.initialPeriod.startDate,
            endDate: r.initialPeriod.endDate,
            billingCycle: r.initialPeriod.billingCycle,
            priceAmount: r.initialPeriod.priceAmount,
            currency: 'COP',
            renewalOutcome: 'pending',
            outcomeReason: null,
            paymentStatus: r.initialPeriod.paymentStatus,
            confirmedAt: null,
            confirmedBy: null,
            contractReference: r.contractReference,
          },
          createdAt: now,
          updatedAt: now,
        };
        store.subscriptions.set(id, view);
        return view;
      },
    },
    subscriptionsList: {
      list: async (q) => {
        const all = [...store.subscriptions.values()].filter(
          (s) =>
            (!q.clientId || s.clientId === q.clientId) &&
            (!q.productId || s.productId === q.productId) &&
            (!q.status?.length || q.status.includes(s.status)),
        );
        return {
          items: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
          total: all.length,
        };
      },
    },
    subscriptionDetail: { findById: async (id) => store.subscriptions.get(id) ?? null },
    subscriptionActivate: {
      loadForUpdate: async (id) => store.subscriptions.get(id) ?? null,
      activate: async (id, expectedVersion) => {
        const s = store.subscriptions.get(id);
        if (!s || s.version !== expectedVersion) return null;
        const next: SubscriptionView = {
          ...s,
          status: 'active',
          version: s.version + 1,
          updatedAt: new Date(),
        };
        store.subscriptions.set(id, next);
        return next;
      },
    },
    subscriptionUpdate: {
      loadForUpdate: async (id) => store.subscriptions.get(id) ?? null,
      save: async (id, expectedVersion, p: SubscriptionPatch) => {
        const s = store.subscriptions.get(id);
        if (!s || s.version !== expectedVersion) return null;
        const next: SubscriptionView = {
          ...s,
          ...(p.contractReference !== undefined ? { contractReference: p.contractReference } : {}),
          ...(p.renewalTerms !== undefined ? { renewalTerms: p.renewalTerms } : {}),
          ...(p.isRenewable !== undefined ? { isRenewable: p.isRenewable } : {}),
          ...(p.visibleInPortal !== undefined ? { visibleInPortal: p.visibleInPortal } : {}),
          ...(p.ownerUserId !== undefined ? { ownerUserId: p.ownerUserId } : {}),
          ...(p.notes !== undefined ? { notes: p.notes } : {}),
          ...(p.followUpStatus !== undefined ? { followUpStatus: p.followUpStatus } : {}),
          ...(p.priceAmount !== undefined ? { priceAmount: p.priceAmount } : {}),
          ...(p.supplierCostAmount !== undefined
            ? { supplierCostAmount: p.supplierCostAmount }
            : {}),
          version: s.version + 1,
          updatedAt: new Date(),
        };
        store.subscriptions.set(id, next);
        return next;
      },
    },
    subscriptionCancel: {
      loadForUpdate: async (id) => store.subscriptions.get(id) ?? null,
      cancel: async (id, expectedVersion, reason, cancelledAt) => {
        const s = store.subscriptions.get(id);
        if (!s || s.version !== expectedVersion) return null;
        const next: SubscriptionView = {
          ...s,
          status: 'cancelled',
          cancelledAt,
          cancellationReason: reason,
          version: s.version + 1,
          updatedAt: new Date(),
        };
        store.subscriptions.set(id, next);
        return next;
      },
    },
    subscriptionRenew: {
      loadForUpdate: async (id) => store.subscriptions.get(id) ?? null,
      renew: async (id, expectedVersion, p: RenewSubscriptionParams) => {
        const s = store.subscriptions.get(id);
        if (!s || s.version !== expectedVersion) return null;
        const next: SubscriptionView = {
          ...s,
          currentPeriodEnd: p.endDate,
          status: 'active',
          currentPeriod: {
            id: randomUUID(),
            periodNumber: (s.currentPeriod?.periodNumber ?? 0) + 1,
            startDate: p.startDate,
            endDate: p.endDate,
            billingCycle: p.billingCycle,
            priceAmount: p.priceAmount,
            currency: 'COP',
            renewalOutcome: 'pending',
            outcomeReason: null,
            paymentStatus: p.paymentStatus,
            confirmedAt: null,
            confirmedBy: null,
            contractReference: p.contractReference,
          },
          version: s.version + 1,
          updatedAt: new Date(),
        };
        store.subscriptions.set(id, next);
        return next;
      },
    },
    subscriptionPeriods: {
      list: async (subscriptionId) => {
        const s = store.subscriptions.get(subscriptionId);
        return s?.currentPeriod ? [s.currentPeriod] : [];
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
