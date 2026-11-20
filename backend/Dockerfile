# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY backend ./backend
COPY docs/api ./docs/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fabsoft/shared build && pnpm --filter @fabsoft/backend build
RUN pnpm --filter @fabsoft/backend deploy --prod /prod/backend

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build --chown=node:node /prod/backend ./
COPY --from=build --chown=node:node /repo/docs/api ./docs/api
RUN rm -rf tests coverage scripts migrations src tsconfig*.json eslint* vitest* .env .env.*
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main-api.js"]

# Herramientas de despliegue (migraciones, pg-boss, bootstrap). No es la imagen de runtime.
FROM build AS tools
ENV NODE_ENV=production
WORKDIR /repo
CMD ["pnpm", "--filter", "@fabsoft/backend", "db:status"]
