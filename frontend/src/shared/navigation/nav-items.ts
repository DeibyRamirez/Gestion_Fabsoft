import type { LucideIcon } from 'lucide-react';
import {
  BellRingIcon,
  Building2Icon,
  InboxIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MessageCircleIcon,
  PackageIcon,
  PlugIcon,
  RepeatIcon,
  ScrollTextIcon,
  SettingsIcon,
  SirenIcon,
  UsersIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  /** Rutas con página implementada en el frontend actual. */
  implemented: boolean;
  /** Solo presentación. */
  icon: LucideIcon;
  /** Etiqueta corta para la barra inferior móvil. */
  shortLabel?: string;
};

export const INTERNAL_MAIN_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Panel', implemented: true, icon: LayoutDashboardIcon },
  { href: '/clients', label: 'Clientes', implemented: true, icon: Building2Icon },
  {
    href: '/subscriptions',
    label: 'Suscripciones',
    implemented: true,
    icon: RepeatIcon,
    shortLabel: 'Suscrip.',
  },
  { href: '/renewal-requests', label: 'Solicitudes', implemented: true, icon: InboxIcon },
  { href: '/tasks', label: 'Tareas', implemented: true, icon: ListChecksIcon },
  { href: '/notifications', label: 'Alertas', implemented: true, icon: BellRingIcon },
];

export const INTERNAL_ADMIN_NAV: NavItem[] = [
  { href: '/admin/users', label: 'Usuarios', implemented: true, icon: UsersIcon },
  { href: '/admin/products', label: 'Productos', implemented: true, icon: PackageIcon },
  { href: '/admin/integrations', label: 'Integraciones', implemented: true, icon: PlugIcon },
  { href: '/admin/alert-rules', label: 'Reglas de alerta', implemented: true, icon: SirenIcon },
  { href: '/admin/audit', label: 'Auditoría', implemented: true, icon: ScrollTextIcon },
  { href: '/admin/settings', label: 'Configuración', implemented: false, icon: SettingsIcon },
];

export const PORTAL_NAV: NavItem[] = [
  { href: '/portal', label: 'Mis suscripciones', implemented: true, icon: RepeatIcon },
  { href: '/portal/requests', label: 'Mis solicitudes', implemented: true, icon: InboxIcon },
  { href: '/portal/contact', label: 'Contacto', implemented: true, icon: MessageCircleIcon },
];

/** Barra inferior móvil (< lg): 4 accesos + «Más» que abre el Sheet existente. */
export const MOBILE_TAB_HREFS = ['/dashboard', '/clients', '/subscriptions', '/tasks'] as const;

/** Títulos de sección para el breadcrumb del topbar. */
export const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Panel',
  clients: 'Clientes',
  subscriptions: 'Suscripciones',
  'renewal-requests': 'Solicitudes',
  tasks: 'Tareas',
  notifications: 'Alertas',
  admin: 'Administración',
  users: 'Usuarios',
  products: 'Productos',
  integrations: 'Integraciones',
  'alert-rules': 'Reglas de alerta',
  audit: 'Auditoría',
  settings: 'Configuración',
  portal: 'Portal',
  requests: 'Mis solicitudes',
  contact: 'Contacto',
  new: 'Nuevo',
};
