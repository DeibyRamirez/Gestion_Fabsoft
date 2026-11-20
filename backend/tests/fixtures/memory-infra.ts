import { randomUUID } from 'node:crypto';
import type {
  AuditLogListQuery,
  PortalRenewalRequestListQuery,
  PortalSubscriptionListQuery,
} from '@fabsoft/shared';
import type { AuditLogView } from '../../src/application/audit/shared/audit-log-view.js';
import type {
  AuthUserWithSecret,
  NewRefreshToken,
  RevokeReason,
} from '../../src/application/auth/ports.js';
import type { AuditEntry } from '../../src/application/shared/ports.js';
import type { AlertRuleView } from '../../src/application/alerts/shared/alert-rule-view.js';
import type { AlertRulePatch } from '../../src/application/alerts/update-alert-rule/ports.js';
import type { UserView } from '../../src/application/users/shared/user-view.js';
import type { ClientView } from '../../src/application/clients/shared/client-view.js';
import type { ClientContactView } from '../../src/application/clients/shared/client-contact-view.js';
import type { NewRenewalRequestRecord } from '../../src/application/renewal-requests/create-renewal-request/ports.js';
import type {
  CreatedRenewalRequestView,
  PortalRenewalRequestView,
  PortalSubscriptionView,
} from '../../src/application/portal/shared/portal-views.js';
import type {
  ApiCredentialView,
  IntegrationView,
} from '../../src/application/integrations/shared/integration-views.js';
import type { NewSubscriptionRecord } from '../../src/application/subscriptions/create-subscription/ports.js';
import type { SubscriptionView } from '../../src/application/subscriptions/shared/subscription-view.js';
import type { SubscriptionPeriodView } from '../../src/application/subscriptions/shared/subscription-view.js';
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
  alertRules = new Map<string, AlertRuleView>();
  renewalRequests = new Map<string, CreatedRenewalRequestView & { clientId: string }>();
  integrations = new Map<string, IntegrationView>();
  credentials = new Map<string, ApiCredentialView & { keyHash: string }>();

  addUser(p: Partial<MemUser> & Pick<MemUser, 'email' | 'role'> & { password: string }): MemUser {
    const now = new Date();
    const u: MemUser = {
      id: randomUUID(),
      fullName: p.fullName ?? p.email,
      clientId: p.clientId ?? null,
      status: p.status ?? 'activo',
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
  const alerts = {
    scheduleForPeriod: async () => 0,
    cancelPendingForPeriod: async () => 0,
    cancelPendingWithoutException: async () => 0,
    cancelAllPending: async () => 0,
    reconcile: async () => ({ scannedSubscriptions: 0, scheduled: 0, cancelled: 0 }),
  };

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
      reason: e.reason ?? null,
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
    apiKeyAuth: {
      findByPrefix: async (keyPrefix) => {
        const credential = [...store.credentials.values()].find((c) => c.keyPrefix === keyPrefix);
        const integration = credential
          ? store.integrations.get(credential.integrationId)
          : undefined;
        if (!credential || !integration) return null;
        return {
          credentialId: credential.id,
          integrationId: credential.integrationId,
          keyHash: credential.keyHash,
          expiresAt: credential.expiresAt,
          revokedAt: credential.revokedAt,
          integrationStatus: integration.status,
          scopes: integration.scopes,
          clientScope: integration.clientScope,
          rateLimitPerMinute: integration.rateLimitPerMinute,
        };
      },
      updateLastUsed: async (credentialId, integrationId, at) => {
        const credential = store.credentials.get(credentialId);
        if (credential) store.credentials.set(credentialId, { ...credential, lastUsedAt: at });
        const integration = store.integrations.get(integrationId);
        if (integration) store.integrations.set(integrationId, { ...integration, lastUsedAt: at });
      },
    },
    idempotencyRelease: {
      release: async (actorType, actorId, key) => {
        const mapKey = `${actorType}|${actorId}|${key}`;
        if (store.idem.get(mapKey)?.responseStatus === null) store.idem.delete(mapKey);
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
    alerts,
    alertRulesList: {
      list: async () =>
        [...store.alertRules.values()].sort(
          (a, b) => b.offsetDays - a.offsetDays || a.code.localeCompare(b.code),
        ),
    },
    alertRuleUpdate: {
      loadForUpdate: async (id) => store.alertRules.get(id) ?? null,
      save: async (id, patch: AlertRulePatch) => {
        const current = store.alertRules.get(id);
        if (!current) throw new Error('alert rule not found');
        const next: AlertRuleView = {
          ...current,
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.offsetDays !== undefined ? { offsetDays: patch.offsetDays } : {}),
          ...(patch.channels !== undefined ? { channels: patch.channels } : {}),
          ...(patch.createsTask !== undefined ? { createsTask: patch.createsTask } : {}),
          ...(patch.taskType !== undefined ? { taskType: patch.taskType } : {}),
          ...(patch.taskPriority !== undefined ? { taskPriority: patch.taskPriority } : {}),
          ...(patch.appliesWhenNotRenewable !== undefined
            ? { appliesWhenNotRenewable: patch.appliesWhenNotRenewable }
            : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        };
        if (
          next.offsetDays !== current.offsetDays &&
          [...store.alertRules.values()].some(
            (rule) => rule.id !== id && rule.offsetDays === next.offsetDays,
          )
        ) {
          return { ok: false as const, reason: 'offset_taken' as const };
        }
        if (!next.createsTask) {
          next.taskType = null;
          next.taskPriority = null;
        }
        if (next.createsTask && (!next.taskType || !next.taskPriority)) {
          return { ok: false as const, reason: 'invalid_task_configuration' as const };
        }
        store.alertRules.set(id, next);
        return { ok: true as const, rule: next };
      },
    },
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
        const k = `${r.actorType}|${r.actorId}|${r.key}`;
        if (store.idem.has(k)) return false;
        store.idem.set(k, idemRow(r));
        return true;
      },
      find: async (actorType, actorId, key) => {
        const row = store.idem.get(`${actorType}|${actorId}|${key}`);
        return row ? { ...row, expired: row.expiresAt <= new Date() } : null;
      },
      restart: async (r) => void store.idem.set(`${r.actorType}|${r.actorId}|${r.key}`, idemRow(r)),
      saveResponse: async (actorType, actorId, key, status, body) =>
        void Object.assign(store.idem.get(`${actorType}|${actorId}|${key}`)!, {
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
        [...store.users.values()].filter((u) => u.role === 'admin' && u.status === 'activo').length,
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
          status: 'activo',
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
              conflict: { existingClientId: dup.id, archived: dup.status === 'archivado' },
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
              conflict: { existingClientId: dup.id, archived: dup.status === 'archivado' },
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
        const next = { ...c, status: 'archivado' as const, archivedAt, updatedAt: new Date() };
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
          status: 'activo' as const,
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
          followUpStatus: 'sin_gestion',
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
            renewalOutcome: 'pendiente',
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
          status: 'activa',
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
          status: 'cancelada',
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
          status: 'activa',
          followUpStatus: 'sin_gestion',
          currentPeriod: {
            id: randomUUID(),
            periodNumber: (s.currentPeriod?.periodNumber ?? 0) + 1,
            startDate: p.startDate,
            endDate: p.endDate,
            billingCycle: p.billingCycle,
            priceAmount: p.priceAmount,
            currency: 'COP',
            renewalOutcome: 'pendiente',
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
    subscriptionStartRenewal: {
      loadForUpdate: async (id) => store.subscriptions.get(id) ?? null,
      startRenewal: async (id, expectedVersion) => {
        const s = store.subscriptions.get(id);
        if (!s || s.version !== expectedVersion) return null;
        const next: SubscriptionView = {
          ...s,
          status: 'en_renovacion',
          followUpStatus: 'en_gestion',
          version: s.version + 1,
          updatedAt: new Date(),
        };
        store.subscriptions.set(id, next);
        return next;
      },
    },
    subscriptionMarkNotRenewed: {
      loadForUpdate: async (id) => store.subscriptions.get(id) ?? null,
      markNotRenewed: async (id, expectedVersion, p) => {
        const s = store.subscriptions.get(id);
        if (!s || s.version !== expectedVersion || !s.currentPeriod) return null;
        const next: SubscriptionView = {
          ...s,
          status: p.immediateStatus ?? s.status,
          followUpStatus: 'cerrado',
          currentPeriod: {
            ...s.currentPeriod,
            renewalOutcome: 'no_renovada',
            outcomeReason: p.reason,
            confirmedAt: p.confirmedAt,
          },
          version: s.version + 1,
          updatedAt: new Date(),
        };
        store.subscriptions.set(id, next);
        return next;
      },
    },
    subscriptionCorrectExpiration: {
      loadForUpdate: async (id) => store.subscriptions.get(id) ?? null,
      correctExpiration: async (id, expectedVersion, p) => {
        const s = store.subscriptions.get(id);
        if (!s || s.version !== expectedVersion || !s.currentPeriod) return null;
        const next: SubscriptionView = {
          ...s,
          currentPeriodEnd: p.newCurrentPeriodEnd,
          currentPeriod: { ...s.currentPeriod, endDate: p.newCurrentPeriodEnd },
          version: s.version + 1,
          updatedAt: new Date(),
        };
        store.subscriptions.set(id, next);
        return next;
      },
    },
    subscriptionPeriodPayment: {
      loadPeriodForUpdate: async (subscriptionId, periodId) => {
        const s = store.subscriptions.get(subscriptionId);
        return s?.currentPeriod?.id === periodId ? s.currentPeriod : null;
      },
      updatePayment: async (subscriptionId, periodId, p) => {
        const s = store.subscriptions.get(subscriptionId);
        if (!s?.currentPeriod || s.currentPeriod.id !== periodId) return null;
        const period: SubscriptionPeriodView = {
          ...s.currentPeriod,
          ...(p.paymentStatus !== undefined ? { paymentStatus: p.paymentStatus } : {}),
          ...(p.contractReference !== undefined ? { contractReference: p.contractReference } : {}),
        };
        store.subscriptions.set(subscriptionId, { ...s, currentPeriod: period });
        return period;
      },
    },
    subscriptionPeriods: {
      list: async (subscriptionId) => {
        const s = store.subscriptions.get(subscriptionId);
        return s?.currentPeriod ? [s.currentPeriod] : [];
      },
    },
    tasksList: { list: async () => ({ items: [], total: 0 }) },
    taskDetail: { findById: async () => null },
    taskCreate: {
      insert: async () => {
        throw new Error('taskCreate no implementado en memoria');
      },
    },
    taskUpdate: {
      loadForUpdate: async () => null,
      save: async () => null,
    },
    taskClose: {
      loadForUpdate: async () => null,
      close: async () => null,
    },
    tasksAutomation: {
      completeAutoTasksForSubscription: async () => 0,
      cancelPendingAutoTasksForPeriod: async () => 0,
      annotateInProgressAutoTasksForPeriod: async () => 0,
      cancelOpenAutoTasksForSubscription: async () => 0,
      cancelOpenTasksForSubscription: async () => 0,
    },
    renewalRequests: {
      resolveOpenForSubscription: async () => 0,
    },
    renewalRequestsList: {
      list: async () => ({ items: [], total: 0 }),
    },
    renewalRequestDetail: {
      findById: async () => null,
    },
    renewalRequestCreate: {
      findForClient: async (clientId, subscriptionId) => {
        const s = store.subscriptions.get(subscriptionId);
        if (!s || s.clientId !== clientId || !s.visibleInPortal) return null;
        return {
          id: s.id,
          clientId: s.clientId,
          productName: s.product.name,
          status: s.status,
        };
      },
      findForStaff: async (subscriptionId) => {
        const s = store.subscriptions.get(subscriptionId);
        return s
          ? { id: s.id, clientId: s.clientId, productName: s.product.name, status: s.status }
          : null;
      },
      insert: async (record: NewRenewalRequestRecord): Promise<CreatedRenewalRequestView> => {
        const now = new Date();
        const request: CreatedRenewalRequestView = {
          id: randomUUID(),
          subscriptionId: record.subscriptionId,
          clientId: record.clientId,
          productName: record.productName,
          comment: record.comment,
          status: 'pendiente_revision',
          createdAt: now,
          updatedAt: now,
          requestedBy: { actorType: 'user', id: record.requestedByUserId },
        };
        store.renewalRequests.set(request.id, request);
        return request;
      },
    },
    portalMe: {
      findOrganization: async (clientId) => {
        const c = store.clientRows.get(clientId);
        return c ? { id: c.id, legalName: c.legalName, taxId: c.taxId } : null;
      },
      findContactChannel: async () => ({ email: null, phone: null, hours: null }),
    },
    portalSubscriptions: {
      list: async (clientId: string, query: PortalSubscriptionListQuery) => {
        const items = [...store.subscriptions.values()]
          .filter((s) => s.clientId === clientId && s.visibleInPortal)
          .filter((s) => !query.status?.length || query.status.includes(s.status))
          .map((s): PortalSubscriptionView => ({
            id: s.id,
            productName: s.product.name,
            contractReference: s.contractReference,
            startDate: s.startDate,
            currentPeriodEnd: s.currentPeriodEnd,
            billingCycle: s.billingCycle,
            priceAmount: s.priceAmount,
            currency: 'COP',
            status: s.status,
            renewalTerms: s.renewalTerms,
            hasOpenRenewalRequest: [...store.renewalRequests.values()].some(
              (r) =>
                r.subscriptionId === s.id &&
                (r.status === 'pendiente_revision' || r.status === 'en_progreso'),
            ),
          }));
        return { items, total: items.length };
      },
    },
    portalSubscription: {
      findById: async (clientId: string, id: string) => {
        const s = store.subscriptions.get(id);
        if (!s || s.clientId !== clientId || !s.visibleInPortal) return null;
        return {
          id: s.id,
          productName: s.product.name,
          contractReference: s.contractReference,
          startDate: s.startDate,
          currentPeriodEnd: s.currentPeriodEnd,
          billingCycle: s.billingCycle,
          priceAmount: s.priceAmount,
          currency: 'COP' as const,
          status: s.status,
          renewalTerms: s.renewalTerms,
          hasOpenRenewalRequest: [...store.renewalRequests.values()].some(
            (r) =>
              r.subscriptionId === s.id &&
              (r.status === 'pendiente_revision' || r.status === 'en_progreso'),
          ),
        };
      },
    },
    portalPeriods: {
      list: async (subscriptionId: string) => {
        const s = store.subscriptions.get(subscriptionId);
        if (!s?.currentPeriod) return [];
        return [
          {
            periodNumber: s.currentPeriod.periodNumber,
            startDate: s.currentPeriod.startDate,
            endDate: s.currentPeriod.endDate,
            billingCycle: s.currentPeriod.billingCycle,
            priceAmount: s.currentPeriod.priceAmount,
            currency: 'COP' as const,
            renewalOutcome: s.currentPeriod.renewalOutcome,
          },
        ];
      },
    },
    portalRenewalRequests: {
      list: async (clientId: string, query: PortalRenewalRequestListQuery) => {
        const items = [...store.renewalRequests.values()]
          .filter((r) => r.clientId === clientId)
          .filter((r) => !query.subscriptionId || r.subscriptionId === query.subscriptionId)
          .map((r): PortalRenewalRequestView => ({
            id: r.id,
            subscriptionId: r.subscriptionId,
            productName: r.productName,
            comment: r.comment,
            status: r.status,
            resolution: null,
            resolutionNote: null,
            createdAt: r.createdAt,
            resolvedAt: null,
          }));
        return { items, total: items.length };
      },
    },
    portalRenewalRequest: {
      findById: async (clientId: string, id: string) => {
        const r = store.renewalRequests.get(id);
        if (!r || r.clientId !== clientId) return null;
        return {
          id: r.id,
          subscriptionId: r.subscriptionId,
          productName: r.productName,
          comment: r.comment,
          status: r.status,
          resolution: null,
          resolutionNote: null,
          createdAt: r.createdAt,
          resolvedAt: null,
        };
      },
    },
    integrationsList: {
      list: async (query) => {
        const items = [...store.integrations.values()].filter(
          (i) => !query.status || i.status === query.status,
        );
        return { items, total: items.length };
      },
    },
    integrationDetail: {
      findById: async (id) => store.integrations.get(id) ?? null,
    },
    integrationClients: {
      findClientStatuses: async (ids) => {
        const map = new Map<string, 'activo' | 'inactivo' | 'archivado'>();
        for (const id of ids) {
          const c = store.clientRows.get(id);
          if (c) map.set(id, c.status);
        }
        return map;
      },
    },
    integrationCreate: {
      insert: async (record) => {
        const now = new Date();
        const view: IntegrationView = {
          id: randomUUID(),
          slug: record.manifest.integration,
          name: record.manifest.display_name,
          description: record.manifest.description ?? null,
          status: 'activa',
          scopes: record.manifest.scopes,
          clientScope: record.manifest.client_scope,
          clientIds: record.manifest.client_ids ?? [],
          manifestVersion: record.manifest.version,
          manifest: record.manifest,
          rateLimitPerMinute: record.manifest.rate_limit_per_minute,
          activeCredentials: 0,
          lastUsedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        store.integrations.set(view.id, view);
        return view;
      },
    },
    integrationUpdate: {
      update: async (record) => {
        const current = store.integrations.get(record.id);
        if (!current) return null;
        const next: IntegrationView = {
          ...current,
          ...(record.patch.name !== undefined ? { name: record.patch.name } : {}),
          ...(record.patch.description !== undefined
            ? { description: record.patch.description }
            : {}),
          ...(record.patch.status !== undefined ? { status: record.patch.status } : {}),
          updatedAt: new Date(),
        };
        store.integrations.set(next.id, next);
        return next;
      },
    },
    integrationManifest: {
      replaceManifest: async (record) => {
        const current = store.integrations.get(record.id);
        if (!current) return null;
        const next: IntegrationView = {
          ...current,
          name: record.manifest.display_name,
          description: record.manifest.description ?? null,
          scopes: record.manifest.scopes,
          clientScope: record.manifest.client_scope,
          clientIds: record.manifest.client_ids ?? [],
          manifestVersion: record.manifest.version,
          manifest: record.manifest,
          rateLimitPerMinute: record.manifest.rate_limit_per_minute,
          updatedAt: new Date(),
        };
        store.integrations.set(next.id, next);
        return next;
      },
    },
    credentials: {
      listCredentials: async (integrationId) =>
        [...store.credentials.values()]
          .filter((c) => c.integrationId === integrationId)
          .map(({ keyHash: _ignored, ...credential }) => credential),
      countActive: async (integrationId, at) =>
        [...store.credentials.values()].filter(
          (c) =>
            c.integrationId === integrationId &&
            c.revokedAt === null &&
            (c.expiresAt === null || c.expiresAt.getTime() > at.getTime()),
        ).length,
      insertCredential: async (record) => {
        const credential: ApiCredentialView & { keyHash: string } = {
          id: randomUUID(),
          integrationId: record.integrationId,
          keyPrefix: record.keyPrefix,
          label: record.label,
          expiresAt: record.expiresAt,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
          keyHash: record.keyHash,
        };
        store.credentials.set(credential.id, credential);
        const integration = store.integrations.get(record.integrationId);
        if (integration) {
          store.integrations.set(integration.id, {
            ...integration,
            activeCredentials: integration.activeCredentials + 1,
          });
        }
        const { keyHash: _ignored, ...view } = credential;
        return view;
      },
      revoke: async (integrationId, credentialId, _revokedBy, at) => {
        const current = store.credentials.get(credentialId);
        if (!current || current.integrationId !== integrationId || current.revokedAt) return null;
        const next = { ...current, revokedAt: at };
        store.credentials.set(credentialId, next);
        const { keyHash: _ignored, ...view } = next;
        return view;
      },
    },
    integrationSubscriptions: {
      list: async () => ({
        items: [...store.subscriptions.values()],
        total: store.subscriptions.size,
      }),
    },
    integrationSubscriptionDetail: {
      findById: async (id) => store.subscriptions.get(id) ?? null,
    },
    integrationPeriods: {
      listPeriods: async (subscriptionId) => {
        const period = store.subscriptions.get(subscriptionId)?.currentPeriod;
        return period ? [period] : [];
      },
    },
    integrationRequestCreate: {
      findForIntegration: async (_integrationId, subscriptionId) => {
        const s = store.subscriptions.get(subscriptionId);
        return s ? { id: s.id, clientId: s.clientId, status: s.status } : null;
      },
      insert: async (record) => {
        const now = new Date();
        return {
          id: randomUUID(),
          subscriptionId: record.subscriptionId,
          clientId: record.clientId,
          comment: record.comment,
          status: 'pendiente_revision',
          createdAt: now,
          updatedAt: now,
          requestedBy: { actorType: 'integration', id: record.requestedByIntegrationId },
        };
      },
    },
    dashboardSummary: {
      counts: async () => ({
        activeSubscriptions: 0,
        expiringIn30Days: 0,
        expiringIn15Days: 0,
        expiringIn7Days: 0,
        expiredSubscriptions: 0,
        renewalsPendingResponse: 0,
        overdueTasks: 0,
        upcomingTasks: 0,
        newRenewalRequests: 0,
      }),
    },
    notificationsList: {
      list: async () => ({ items: [], total: 0, unreadCount: 0 }),
    },
    notificationsRead: {
      findById: async () => null,
      markRead: async () => false,
    },
    notificationsRetry: {
      loadForRetry: async () => null,
      restart: async () => null,
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
    workerUow: {
      run: (_rid, work) =>
        work({
          idempotency: { purgeExpired: async () => 0 },
          alerts,
          notificationsDispatch: {
            claimDue: async () => ({ items: [], cancelled: 0 }),
            markSent: async () => false,
            markFailure: async () => false,
          },
          subscriptionsExpire: {
            expire: async () => ({ expired: 0, notRenewed: 0 }),
          },
          maintenance: {
            cleanup: async () => ({ idempotencyKeys: 0, refreshTokens: 0 }),
          },
          renewalRequestProcess: {
            findContext: async () => null,
            createFollowUp: async () => ({ taskId: null, notifications: 0 }),
          },
        }),
    },
    hasher: fakeHasher,
    integrationRateLimiter: {
      check: (integrationId, limit, now) => ({
        allowed: true,
        limit,
        remaining: limit,
        resetAt: new Date(now.getTime() + 60_000),
      }),
    },
    apiKeys: {
      generate: () => {
        const keyPrefix = `fsk_test_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
        const secret = randomUUID();
        return {
          apiKey: `${keyPrefix}_${secret}`,
          keyPrefix,
          keyHash: `h:${secret}`,
        };
      },
      verify: (secret, keyHash) => keyHash === `h:${secret}`,
    },
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
