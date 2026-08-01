# syntax=docker/dockerfile:1.7
# Node 22 인 이유는 Dockerfile.fly 와 같다 — pnpm 11 이 node:sqlite 를 쓰므로
# Node >= 22.13 이 아니면 `pnpm install` 이 죽는다. (런타임은 nginx 라 무관하다)
FROM node:22-alpine AS builder
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
