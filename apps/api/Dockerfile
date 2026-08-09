FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @devify/database prisma generate
RUN pnpm --filter @devify/api build

EXPOSE 4000
CMD ["pnpm", "--filter", "@devify/api", "start"]
