import type { ClientStatus } from './client-status.js';

export function canArchiveClient(status: ClientStatus): boolean {
  return status === 'active' || status === 'inactive';
}

export function canReactivateClient(status: ClientStatus): boolean {
  return status === 'archived' || status === 'inactive';
}

export function isArchived(status: ClientStatus): boolean {
  return status === 'archived';
}