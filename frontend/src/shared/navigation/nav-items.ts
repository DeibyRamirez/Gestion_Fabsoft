export type NavItem = {
  href: string;
  label: string;
  /** Rutas con página implementada en el frontend actual. */
  implemented: boolean;
};

export const INTERNAL_MAIN_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Panel', implemented: true },
  { href: '/clients', label: 'Clientes', implemented: false },
  { href: '/subscriptions', label: 'Suscripciones', implemented: false },
  { href: '/renewal-requests', label: 'Solicitudes', implemented: false },
  { href: '/tasks', label: 'Tareas', implemented: false },
  { href: '/notifications', label: 'Alertas', implemented: false },
];

export const INTERNAL_ADMIN_NAV: NavItem[] = [
  { href: '/admin/users', label: 'Usuarios', implemented: true },
  { href: '/admin/products', label: 'Productos', implemented: false },
  { href: '/admin/integrations', label: 'Integraciones', implemented: false },
  { href: '/admin/alert-rules', label: 'Reglas de alerta', implemented: false },
  { href: '/admin/audit', label: 'Auditoría', implemented: false },
  { href: '/admin/settings', label: 'Configuración', implemented: false },
];

export const PORTAL_NAV: NavItem[] = [
  { href: '/portal', label: 'Mis suscripciones', implemented: true },
  { href: '/portal/requests', label: 'Mis solicitudes', implemented: false },
  { href: '/portal/contact', label: 'Contacto', implemented: false },
];
