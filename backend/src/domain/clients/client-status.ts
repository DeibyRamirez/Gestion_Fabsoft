/** Estado del cliente (app.client_status). */
export type ClientStatus = 'active' | 'inactive' | 'archived';

export const CLIENT_STATUSES: readonly ClientStatus[] = ['active', 'inactive', 'archived'] as const;

export function isClientStatus(value: string): value is ClientStatus {
  return (CLIENT_STATUSES as readonly string[]).includes(value);
}
