/** Estado del cliente (app.client_status). */
export type ClientStatus = 'activo' | 'inactivo' | 'archivado';

export const CLIENT_STATUSES: readonly ClientStatus[] = ['activo', 'inactivo', 'archivado'] as const;

export function isClientStatus(value: string): value is ClientStatus {
  return (CLIENT_STATUSES as readonly string[]).includes(value);
}
