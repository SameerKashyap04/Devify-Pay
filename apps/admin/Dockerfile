# NOTE: The Next.js admin app scaffold has not been generated yet in this
# build pass — see docs/architecture.md "Remaining work". This Dockerfile
# is a placeholder for when apps/admin contains a Next.js project.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/admin ./apps/admin

RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @devify/admin build

EXPOSE 3000
CMD ["pnpm", "--filter", "@devify/admin", "start"]
