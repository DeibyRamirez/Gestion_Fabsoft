const SUMMARIES: Record<string, string> = {
  'client.created': 'Cliente creado',
  'client.updated': 'Cliente actualizado',
  'client.archived': 'Cliente archivado',
  'client.reactivated': 'Cliente reactivado',
  'client_contact.created': 'Contacto creado',
  'client_contact.updated': 'Contacto actualizado',
  'client_contact.archived': 'Contacto archivado',
  'client_contact.reactivated': 'Contacto reactivado',
  'product.created': 'Producto creado',
  'product.updated': 'Producto actualizado',
  'product.deactivated': 'Producto desactivado',
  'subscription.created': 'Suscripción creada',
  'subscription.updated': 'Suscripción actualizada',
  'subscription.price_changed': 'Precio de suscripción actualizado',
  'subscription.activated': 'Suscripción activada',
  'subscription.cancelled': 'Suscripción cancelada',
  'subscription.renewed': 'Suscripción renovada',
};

export function activitySummary(action: string): string {
  return SUMMARIES[action] ?? action;
}
