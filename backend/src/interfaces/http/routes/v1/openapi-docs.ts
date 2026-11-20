import { Router, type RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { JsonObject } from 'swagger-ui-express';
import { loadOpenApiDocument } from '../../openapi/spec.js';
import { sendProblem } from '../../problem.js';

/** Swagger UI necesita sus propios assets, pero sigue sin permitir terceros. */
const DOCS_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const UI_OPTIONS = {
  customSiteTitle: 'FabSoft API v1',
  swaggerOptions: {
    displayRequestDuration: true,
    persistAuthorization: true,
    tryItOutEnabled: true,
  },
};

const unavailable = (res: Parameters<typeof sendProblem>[0]): void =>
  sendProblem(
    res,
    'dependency_unavailable',
    'La especificación OpenAPI no está disponible en este servidor',
  );

/** `/api/v1/docs`: Swagger UI y `openapi.json` servidos desde el mismo origen (sin CDN). */
export function openapiDocsRouter(): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', DOCS_CSP);
    next();
  });

  router.get('/openapi.json', (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(loadOpenApiDocument());
    } catch {
      unavailable(res);
    }
  });

  let ui: RequestHandler | undefined;
  try {
    ui = swaggerUi.setup(loadOpenApiDocument() as JsonObject, UI_OPTIONS);
  } catch {
    ui = undefined;
  }

  router.get('/', (req, res, next) => {
    if (!ui) return unavailable(res);
    // Swagger UI usa URLs relativas (`./swagger-ui.css`): la página debe vivir en `/docs/`.
    const [pathname = req.originalUrl, query] = req.originalUrl.split('?');
    if (!pathname.endsWith('/')) {
      res.redirect(301, `${pathname}/${query ? `?${query}` : ''}`);
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    ui(req, res, next);
  });
  // Después de la página: `express.static` redirigiría `/docs` a `/docs/`.
  router.use(...swaggerUi.serve);

  return router;
}
