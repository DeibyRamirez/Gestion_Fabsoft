# Inventario de rutas del frontend FabSoft (corte `develop`)

Fuente: árbol real `frontend/src/app` + `nav-items.ts` (`implemented`).  
Convención de roles: `admin`, `operator`, `client` (internos = admin + operator).

## Rutas con página implementada

| Ruta | Archivo | Roles (RoleGate) | Estado funcional | Rediseño aplicado |
|------|---------|------------------|------------------|-------------------|
| `/` | `src/app/page.tsx` | Todos (redirección) | Redirige según sesión | Cargando en fondo `bg` |
| `/login` | `src/app/(auth)/login/page.tsx` | Público | Login JWT contra API | Split auth + tarjeta |
| `/change-password` | `src/app/change-password/page.tsx` | Autenticado | Obligatorio o voluntario | Auth split o shell por rol |
| `/dashboard` | `src/app/(internal)/dashboard/page.tsx` | admin, operator | Placeholder + `ApiStatus` | PageHeader + tarjetas |
| `/admin/users` | `src/app/(internal)/admin/users/page.tsx` | admin (`admin/layout`) | CRUD usuarios API | Tabla en tarjetas + header |
| `/portal` | `src/app/(portal)/portal/page.tsx` | client | Placeholder sin datos demo | Portal shell + tarjeta honesta |

## Rutas documentadas / en navegación sin página (honestamente «próximamente»)

Enlaces visibles en `AppShell` / `PortalShell` con `implemented: false` (no clicable, `aria-disabled`).

| Ruta planificada | Nav label | Rol esperado |
|------------------|-----------|--------------|
| `/clients` | Clientes | admin, operator |
| `/subscriptions` | Suscripciones | admin, operator |
| `/renewal-requests` | Solicitudes | admin, operator |
| `/tasks` | Tareas | admin, operator |
| `/notifications` | Alertas | admin, operator |
| `/admin/products` | Productos | admin |
| `/admin/integrations` | Integraciones | admin |
| `/admin/alert-rules` | Reglas de alerta | admin |
| `/admin/audit` | Auditoría | admin |
| `/admin/settings` | Configuración | admin |
| `/portal/requests` | Mis solicitudes | client |
| `/portal/contact` | Contacto | client |

## Deliberadamente omitido del mock (no existía en código)

- Banner «datos ficticios»
- Recuperar contraseña / recordarme
- Buscador global
- Métricas KPI en panel (API dashboard no conectada)
- Categorías / modalidad / precio en catálogo (RN-02; sin pantalla productos aún)
- Estados cliente mezclados con vigencia de suscripción
