import type { UserListQuery } from '@fabsoft/shared';
import type {
  CreateUserOutcome,
  CreateUserRepository,
  NewUser,
} from '../../../../application/users/create-user/ports.js';
import type { GetUserQuery } from '../../../../application/users/get-user/ports.js';
import type { ListUsersQuery } from '../../../../application/users/list-users/ports.js';
import type { ResetUserPasswordRepository } from '../../../../application/users/reset-user-password/ports.js';
import type {
  UpdateUserRepository,
  UserPatch,
} from '../../../../application/users/update-user/ports.js';
import type { UserView } from '../../../../application/users/shared/user-view.js';
import type { Tx } from '../../../db/with-rls-context.js';
import { PG, pgCode } from '../shared/pg-errors.js';
import { toUserView, USER_COLUMNS, type UserRow } from '../shared/user-columns.js';

const SORT: Record<UserListQuery['sort'], string> = {
  fullName: 'full_name asc, id',
  '-fullName': 'full_name desc, id',
  createdAt: 'created_at asc, id',
  '-createdAt': 'created_at desc, id',
};

export class PgListUsersQuery implements ListUsersQuery {
  constructor(private readonly tx: Tx) {}
  async list(q: UserListQuery): Promise<{ items: UserView[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      values.push(v);
      where.push(sql.replace('?', `$${values.length}`));
    };
    if (q.q)
      add(
        `(full_name ilike ? or email ilike $${values.length + 1})`,
        `%${q.q.replace(/[%_\\]/g, '\\$&')}%`,
      );
    if (q.role?.length) add('role = any(?::app.user_role[])', q.role);
    if (q.status) add('status = ?::app.user_status', q.status);
    if (q.clientId) add('client_id = ?', q.clientId);
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::text as n from app.users ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<UserRow>(
      `select ${USER_COLUMNS} from app.users ${filter} order by ${SORT[q.sort]} limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: rows.map(toUserView), total: Number(count.rows[0]?.n ?? 0) };
  }
}

export class PgGetUserQuery implements GetUserQuery {
  constructor(private readonly tx: Tx) {}
  async findById(id: string): Promise<UserView | null> {
    const { rows } = await this.tx.query<UserRow>(
      `select ${USER_COLUMNS} from app.users where id = $1`,
      [id],
    );
    return rows[0] ? toUserView(rows[0]) : null;
  }
}

export class PgCreateUserRepository implements CreateUserRepository {
  constructor(private readonly tx: Tx) {}
  async insert(u: NewUser): Promise<CreateUserOutcome> {
    try {
      const { rows } = await this.tx.query<UserRow>(
        `insert into app.users (email, full_name, password_hash, role, client_id, must_change_password, created_by, updated_by)
         values ($1, $2, $3, $4, $5, true, $6, $6) returning ${USER_COLUMNS}`,
        [u.email, u.fullName, u.passwordHash, u.role, u.clientId, u.createdBy],
      );
      return { ok: true, user: toUserView(rows[0] as UserRow) };
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation) return { ok: false, reason: 'duplicate_email' };
      if (pgCode(err) === PG.foreignKeyViolation) return { ok: false, reason: 'unknown_client' };
      throw err;
    }
  }
}

export class PgUpdateUserRepository implements UpdateUserRepository {
  constructor(private readonly tx: Tx) {}
  async loadForUpdate(id: string): Promise<UserView | null> {
    const { rows } = await this.tx.query<UserRow>(
      `select ${USER_COLUMNS} from app.users where id = $1 for update`,
      [id],
    );
    return rows[0] ? toUserView(rows[0]) : null;
  }
  async countActiveAdmins(): Promise<number> {
    const { rows } = await this.tx.query<{ n: string }>(
      `select count(*)::text as n from app.users where role = 'admin' and status = 'active'`,
    );
    return Number(rows[0]?.n ?? 0);
  }
  async save(id: string, p: UserPatch): Promise<UserView | 'unknown_client'> {
    try {
      const { rows } = await this.tx.query<UserRow>(
        `update app.users set full_name = coalesce($2, full_name), role = $3, client_id = $4, status = $5, updated_by = $6
          where id = $1 returning ${USER_COLUMNS}`,
        [id, p.fullName ?? null, p.role, p.clientId, p.status, p.updatedBy],
      );
      return toUserView(rows[0] as UserRow);
    } catch (err) {
      if (pgCode(err) === PG.foreignKeyViolation) return 'unknown_client';
      throw err;
    }
  }
}

export class PgResetUserPasswordRepository implements ResetUserPasswordRepository {
  constructor(private readonly tx: Tx) {}
  async setTemporaryPassword(
    id: string,
    passwordHash: string,
    updatedBy: string,
  ): Promise<boolean> {
    const res = await this.tx.query(
      `update app.users set password_hash = $2, must_change_password = true, updated_by = $3 where id = $1`,
      [id, passwordHash, updatedBy],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
