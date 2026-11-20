import { ArchiveClient } from '../../application/clients/archive-client/use-case.js';
import { CreateClient } from '../../application/clients/create-client/use-case.js';
import { ExportClientsCsv } from '../../application/clients/export-clients-csv/use-case.js';
import { GetClient } from '../../application/clients/get-client/use-case.js';
import { ListClientOwnerCandidates } from '../../application/clients/list-owner-candidates/use-case.js';
import { ListClients } from '../../application/clients/list-clients/use-case.js';
import { ReactivateClient } from '../../application/clients/reactivate-client/use-case.js';
import { UpdateClient } from '../../application/clients/update-client/use-case.js';
import type { Infra } from '../infra.js';

export function clientsModule(infra: Infra) {
  const listClients = new ListClients(infra.userUow);
  return {
    listClients,
    exportClientsCsv: new ExportClientsCsv(listClients),
    listClientOwnerCandidates: new ListClientOwnerCandidates(infra.userUow),
    getClient: new GetClient(infra.userUow),
    createClient: new CreateClient(infra.userUow),
    updateClient: new UpdateClient(infra.userUow),
    archiveClient: new ArchiveClient(infra.userUow),
    reactivateClient: new ReactivateClient(infra.userUow),
  };
}
