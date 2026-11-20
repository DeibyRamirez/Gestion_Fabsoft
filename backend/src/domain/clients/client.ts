import type { ClientStatus } from './client-status.js';

export function canArchiveClient(status: ClientStatus): boolean {
  return status === 'activo' || status === 'inactivo';
}

export function canReactivateClient(status: ClientStatus): boolean {
  return status === 'archivado' || status === 'inactivo';
}

export function isArchived(status: ClientStatus): boolean {
  return status === 'archivado';
}
