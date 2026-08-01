# syntax=docker/dockerfile:1.7
# Node 22 인 이유는 Dockerfile.fly 와 같다 — pnpm 11 이 node:sqlite 를 쓰므로
# Node >= 22.13 이 아니면 `pnpm install` 이 죽는다. 런타임도 기동 시 pnpm 을 부른다.
FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache sqlite gzip tini openssl
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
# postinstall 이 실행하는 파일이라 install 보다 먼저 들어와야 한다 (Dockerfile.fly 와 같은 이유).
COPY apps/api/scripts/postinstall.js ./apps/api/scripts/
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
