# Sistema de diseño — FabSoft

> Implementación: Tailwind CSS 4 (`@theme` con variables CSS) + shadcn/ui en `frontend/src/shared/ui`. Objetivo: **WCAG 2.2 AA**. Prioridad del producto: visibilidad de "qué requiere atención hoy" (§6.1). Tema claro en el MVP (modo oscuro no incluido).

## 1. Tokens

### 1.1 Color base (neutros y marca)

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-bg` | `#F6F8FC` | Fondo de página (área principal) | — |
| `--color-surface` | `#FFFFFF` | Tarjetas, barra lateral, inputs | — |
| `--color-fg` | `#14213D` | Texto principal (tinta) | ≈16:1 sobre `bg` |
| `--color-fg-muted` | `#5C6B7A` | Texto secundario, ayudas | ≥7:1 sobre `surface` |
| `--color-border` | `#E4E9F2` | Divisores decorativos | (decorativo) |
| `--color-border-input` | `#64748B` | Borde de inputs, checkboxes | 4.76:1 sobre `surface` (≥ 3:1, WCAG 1.4.11) |
| `--color-primary` | `#4338CA` | Botón primario, enlaces, marca | Texto blanco ≥4.5:1 |
| `--color-primary-fg` | `#FFFFFF` | Texto sobre primario | — |
| `--color-brand-panel` | `#14213D` | Panel izquierdo en layouts de auth | Texto blanco sobre panel |
| `--color-brand-panel-muted` | `#94A3B8` | Subtítulos sobre panel auth | Decorativo sobre panel |
| `--color-nav-active-bg` | `#EEF2FF` | Fondo ítem de navegación activo | — |
| `--color-danger` | `#B91C1C` | Acciones destructivas (cancelar, revocar) | Texto blanco 6.47:1 |
| `--color-focus` | `#4338CA` | Anillo de foco 2 px + offset 2 px | ≥3:1 sobre `bg` |

### 1.2 Paleta semántica por estado de suscripción

Insignias (`<StatusBadge>`): texto oscuro sobre fondo tintado + punto indicador + **etiqueta textual siempre visible** (el color nunca es el único portador de información, WCAG 1.4.1).

| Estado (`subscription_status`) | Etiqueta | Texto | Fondo | Punto | Texto/fondo | Punto/fondo |
|---|---|---|---|---|---|---|
| `pending_activation` | Pendiente de activación | `#334155` | `#F1F5F9` | `#64748B` | 9.45:1 | 4.34:1 |
| `active` | Activa | `#166534` | `#DCFCE7` | `#15803D` | 6.49:1 | 4.57:1 |
| `in_renewal` | En renovación | `#1E40AF` | `#DBEAFE` | `#2563EB` | 7.15:1 | 4.24:1 |
| `expired` | Vencida | `#991B1B` | `#FEE2E2` | `#DC2626` | 6.80:1 | 3.95:1 |
| `cancelled` | Cancelada | `#3F3F46` | `#E4E4E7` | `#71717A` | 8.23:1 | 3.81:1 |
| `not_renewed` | No renovada | `#9A3412` | `#FFEDD5` | `#EA580C` | 6.38:1 | 3.11:1 |

Indicador derivado de **urgencia de vencimiento** (no es un estado; se calcula con `daysUntilExpiration` para `active`/`in_renewal`):

| Urgencia | Regla | Texto | Fondo | Punto | Texto/fondo |
|---|---|---|---|---|---|
| Vence pronto | 8–30 días | `#854D0E` | `#FEF9C3` | `#A16207` | 6.38:1 |
| Vence en ≤ 7 días | 0–7 días | `#9A3412` | `#FFEDD5` | `#EA580C` | 6.38:1 (+ icono `AlarmClock`) |

Otras dimensiones (insignias secundarias, nunca mezcladas con la de vigencia, RN-07):

| Dimensión | Valor | Texto | Fondo |
|---|---|---|---|
| Pago | Recibido | `#166534` | `#DCFCE7` |
| Pago | Pendiente | `#92400E` | `#FEF3C7` (6.37:1) |
| Pago | Sin seguimiento | `#334155` | `#F1F5F9` |
| Seguimiento / tarea | En gestión / En progreso | `#1E40AF` | `#DBEAFE` |
| Prioridad | Urgente | `#991B1B` | `#FEE2E2` |
| Prioridad | Alta | `#9A3412` | `#FFEDD5` |
| Prioridad | Media | `#1E40AF` | `#DBEAFE` |
| Prioridad | Baja | `#334155` | `#F1F5F9` |
| Alerta | Fallida | `#991B1B` | `#FEE2E2` |

### 1.3 Tipografía, espaciado, forma

| Token | Valor |
|---|---|
| Fuente | `Inter` (variable, `next/font` local, `display: swap`), fallback `system-ui` |
| Escala | 12 / 14 (base de tablas) / 16 (base de texto) / 18 / 20 / 24 / 30 px; altura de línea 1.5 (texto), 1.25 (títulos) |
| Números | `font-variant-numeric: tabular-nums` en importes y fechas |
| Espaciado | Base 4 px (`--spacing: 0.25rem`); densidad de tabla: fila 44 px (objetivo táctil ≥ 24 px, WCAG 2.5.8) |
| Radios | `--radius-sm 4px`, `--radius-md 8px`, `--radius-lg 12px` (tarjetas), `--radius-full` (insignias) |
| Sombras | `--shadow-card` para tarjetas; sin sombras en tablas |

```css
/* frontend/src/app/globals.css (extracto) */
@import "tailwindcss";
@theme {
  --color-bg: #f6f8fc;  --color-surface: #ffffff;  --color-fg: #14213d;  --color-fg-muted: #5c6b7a;
  --color-border: #e4e9f2;  --color-border-input: #64748b;  --color-primary: #4338ca;
  --color-brand-panel: #14213d;  --color-nav-active-bg: #eef2ff;
  --color-danger: #b91c1c;  --color-focus: #4338ca;
  /* §1.2 estados de suscripción (sin cambios de paleta semántica) */
  --color-status-active-fg: #166534;       --color-status-active-bg: #dcfce7;
  --color-status-in-renewal-fg: #1e40af;   --color-status-in-renewal-bg: #dbeafe;
  --color-status-expired-fg: #991b1b;      --color-status-expired-bg: #fee2e2;
  --color-status-cancelled-fg: #3f3f46;    --color-status-cancelled-bg: #e4e4e7;
  --color-status-not-renewed-fg: #9a3412;  --color-status-not-renewed-bg: #ffedd5;
  --color-status-pending-fg: #334155;      --color-status-pending-bg: #f1f5f9;
  --color-urgency-soon-fg: #854d0e;        --color-urgency-soon-bg: #fef9c3;
  --font-sans: "Inter", system-ui, sans-serif;
  --radius-md: 0.5rem;
}
```

## 2. Formatos (es-CO)

- Moneda: `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` → `$ 1.850.000`. El backend envía string decimal; nunca `float` para cálculos.
- Fechas de negocio: `d MMM yyyy` (`14 nov 2026`) y relativa ("vence en 13 días", "venció hace 2 días"). Siempre interpretadas en America/Bogota.
- Instantes (auditoría): `d MMM yyyy, HH:mm` hora Colombia.

## 3. Componentes

| Componente | Base shadcn/ui | Reglas |
|---|---|---|
| `AppShell` (interno) | `Sidebar`, `Sheet` (móvil) | Navegación: Dashboard, Clientes, Suscripciones, Solicitudes, Tareas, Alertas; sección Admin (Usuarios, Productos, Integraciones, Reglas de alerta, Auditoría, Configuración) visible sólo para admin. Contador de alertas no leídas. |
| `PortalShell` | `NavigationMenu` | Navegación mínima: Mis suscripciones, Mis solicitudes, Contacto. |
| `DataTable` | `Table` + TanStack Query | Paginación servidor (`page`/`pageSize`), ordenación por lista blanca, filtros en la URL (`?status=active,in_renewal`) para que los indicadores del dashboard enlacen a la lista filtrada; estados vacío, cargando (skeleton) y error. `<caption>` accesible. |
| `FilterBar` | `Select`, `Popover`, `Calendar`, `Input` | Filtros de §6.6 (responsable, fecha, prioridad, estado, cliente, suscripción). Botón "Limpiar". |
| `StatusBadge`, `UrgencyBadge`, `PaymentBadge`, `PriorityBadge` | `Badge` | Paleta §1.2; texto siempre presente. |
| `KpiCard` | `Card` | Cifra, etiqueta, enlace "Ver lista" (`<a>` real a la ruta filtrada). |
| `EntityForm` | `Form` (react-hook-form + Zod de `@fabsoft/shared`) | Etiqueta visible por campo, ayuda, error asociado con `aria-describedby`; foco al primer error; confirmación al salir con cambios. |
| `ConfirmDialog` | `AlertDialog` | Obligatorio en acciones de impacto: renovar, no renovar, cancelar (motivo obligatorio), corregir vencimiento (motivo), archivar, revocar credencial. |
| `PeriodTimeline` | personalizado | Historial de periodos (más reciente arriba): fechas, precio, resultado, pago. |
| `ActivityFeed` | personalizado | Eventos de auditoría legibles ("Ana renovó la suscripción … · hace 2 h"). |
| `SecretReveal` | `Dialog` | Muestra la API key una vez con botón copiar y aviso; no se puede reabrir. |
| `Toaster` | `Sonner` de shadcn | Resultado de mutaciones; errores con `code` traducido. |

## 4. Layouts

### 4.1 Interno (admin/operador)
- Barra lateral fija ≥ 1024 px, colapsable; cabecera con búsqueda global de clientes, campana de alertas y menú de usuario.
- **Dashboard**: fila de KPIs (Activas · Vencen en 30/15/7 días · Vencidas · Renovaciones pendientes de respuesta · Tareas vencidas · Tareas próximas · Solicitudes nuevas), cada uno enlazado a su lista; debajo "Mis tareas de hoy" y "Actividad reciente". Aviso si hay alertas fallidas.
- **Ficha de cliente**: cabecera (razón social, NIT, estado, responsable) + pestañas: Suscripciones · Contactos · Tareas · Solicitudes · Notas · Historial.
- **Ficha de suscripción**: cabecera con las tres dimensiones (vigencia, pago del periodo vigente, seguimiento) por separado; acciones contextuales según estado y rol; pestañas: Periodos · Tareas · Alertas · Historial.

### 4.2 Portal de clientes
- Una sola columna, máximo 960 px, lenguaje no técnico.
- Inicio: tarjetas por suscripción (producto, estado, vencimiento, días restantes) con botón "Solicitar renovación" (deshabilitado con explicación si ya hay una solicitud abierta).
- Detalle: fechas, condiciones autorizadas, historial de periodos, solicitudes y canal de contacto de FabSoft.
- Nunca muestra costo, notas internas, responsable ni estado de pago.

## 5. Accesibilidad (checklist de PR)

- Contraste AA (texto ≥ 4.5:1, componentes/foco ≥ 3:1) — valores de §1 verificados.
- Navegación completa por teclado; foco visible (`--color-focus`); orden lógico; *skip link* "Saltar al contenido".
- `lang="es-CO"` en `<html>`; títulos de página únicos (`<title>` y `<h1>`).
- Tablas con `<th scope>` y `aria-sort`; formularios con `<label>` explícito; errores anunciados (`role="alert"` en resumen).
- Diálogos con foco atrapado y retorno de foco (Radix).
- Sin información sólo por color; iconos decorativos `aria-hidden`, informativos con `aria-label`.
- Respetar `prefers-reduced-motion`.
- Pruebas: `@testing-library` con consultas por rol y revisión manual con lector de pantalla (NVDA) antes de cada release.

## 6. Responsive

| Breakpoint | Comportamiento |
|---|---|
| < 640 px | Barra lateral como `Sheet`; tablas se transforman en lista de tarjetas (campos clave + insignias); acciones en menú `…`. |
| 640–1023 px | Barra lateral colapsada a iconos con tooltip; tablas con scroll horizontal y primera columna fija. |
| ≥ 1024 px | Layout completo. |

El portal es *mobile-first* (clientes pueden consultarlo desde el teléfono); la aplicación interna se optimiza para escritorio pero es usable en tableta/móvil. No hay app móvil nativa (fuera de alcance).
