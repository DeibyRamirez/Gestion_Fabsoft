import type { ClientOwnerCandidate } from '@fabsoft/shared';
import type { ListClientOwnerCandidatesQuery } from '../../../../application/clients/list-owner-candidates/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface CandidateRow {
  id: string;
  full_name: string;
  role: 'admin' | 'operator';
}

export class PgClientOwnerCandidatesQuery implements ListClientOwnerCandidatesQuery {
  constructor(private readonly tx: Tx) {}

  async list(): Promise<ClientOwnerCandidate[]> {
    const { rows } = await this.tx.query<CandidateRow>(
      `select id::text as id, full_name, role::text as role
         from app.users
        where status = 'activo' and role in ('admin', 'operator')
        order by full_name, id`,
    );
    return rows.map((row) => ({ id: row.id, fullName: row.full_name, role: row.role }));
  }
}
