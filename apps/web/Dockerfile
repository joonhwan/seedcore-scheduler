# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @sam/shared build \
 && pnpm --filter @sam/web build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
