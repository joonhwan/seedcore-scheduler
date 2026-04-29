# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
RUN corepack enable && apk add --no-cache sqlite gzip tini openssl
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @sam/shared build \
 && pnpm --filter @sam/api prisma:generate \
 && pnpm --filter @sam/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app /app
WORKDIR /app/apps/api
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "pnpm prisma:migrate:deploy && node dist/main.js"]
