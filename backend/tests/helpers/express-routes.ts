import { Router, type Express } from 'express';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

type RouteLike = { path: unknown; methods: Record<string, boolean> };
type LayerLike = { route?: RouteLike; handle?: { stack?: LayerLike[] } };
type RouterLike = { stack: LayerLike[] };
type RouterPrototypeLike = {
  use: (this: unknown, ...args: unknown[]) => unknown;
};

/** Prefijo con el que se montó cada router (se completa al instrumentar `Router#use`). */
const mounts = new WeakMap<object, string>();
let installed = false;

function isRouter(value: unknown): value is object {
  return (
    (typeof value === 'function' || (typeof value === 'object' && value !== null)) &&
    'stack' in value &&
    Array.isArray((value as { stack?: unknown }).stack)
  );
}

/**
 * Express 5 no conserva el path original en cada capa, pero `Router#use` recibe el
 * prefijo al montar un router. Se instrumenta antes de `createApp` para reconstruir
 * el inventario real de rutas y compararlo con OpenAPI.
 */
export function installExpressRouteInventory(): void {
  if (installed) return;
  installed = true;
  const proto = Router.prototype as unknown as RouterPrototypeLike;
  const originalUse = proto.use;

  proto.use = function (this: unknown, ...args: unknown[]) {
    const mount = args.find((arg) => typeof arg === 'string') as string | undefined;
    if (mount) {
      for (const arg of args) {
        if (arg !== mount && isRouter(arg)) mounts.set(arg, mount);
      }
    }
    return originalUse.apply(this, args);
  };
}

const join = (base: string, path: string): string => {
  if (!path) return base || '/';
  const joined = `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  return joined.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

/** Convierte `:id` de Express a `{id}` de OpenAPI. */
export const normalizeExpressPath = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

export function collectExpressRoutes(app: Express): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];

  const walk = (router: RouterLike, base: string): void => {
    for (const layer of router.stack) {
      if (layer.route) {
        if (typeof layer.route.path !== 'string') continue;
        const path = join(base, layer.route.path);
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled && HTTP_METHODS.has(method)) {
            routes.push({ method: method.toUpperCase(), path });
          }
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle as RouterLike, join(base, mounts.get(layer.handle) ?? ''));
      }
    }
  };

  walk((app as unknown as { router: RouterLike }).router, '');
  return routes;
}
