import { MAX_PAGE_SIZE, type ClientListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { toCsv } from '../../shared/csv.js';
import type { ClientView } from '../shared/client-view.js';
import type { ListClients } from '../list-clients/use-case.js';

export interface CsvExport {
  filename: string;
  csv: string;
}

export class ExportClientsCsv {
  constructor(private readonly listClients: ListClients) {}

  async execute(actor: UserActor, query: ClientListQuery): Promise<CsvExport> {
    const items: ClientView[] = [];
    let page = 1;
    while (true) {
      const result = await this.listClients.execute(actor, {
        ...query,
        page,
        pageSize: MAX_PAGE_SIZE,
      });
      items.push(...result.items);
      if (items.length >= result.total || result.items.length === 0) break;
      page++;
    }

    const rows = items.map((client) => [
      client.legalName,
      client.taxId,
      client.id,
      client.status,
      client.owner?.fullName,
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      filename: `clientes-${today}.csv`,
      csv: toCsv(['Razón social', 'NIT', 'ID cliente', 'Estado', 'Responsable'], rows),
    };
  }
}
