import type { ClientView } from '../shared/client-view.js';

export interface ArchiveClientRepository {
  loadForUpdate(id: string): Promise<ClientView | null>;
  archive(id: string, archivedAt: Date, updatedBy: string): Promise<ClientView>;
}

export interface ArchiveClientRepos {
  clientArchive: ArchiveClientRepository;
}