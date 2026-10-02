# Backend Dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Dependencies & Source stage
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY backend ./backend
COPY packages ./packages

RUN corepack enable pnpm && corepack prepare pnpm@9.0.0 --activate && pnpm install --frozen-lockfile

# Builder stage
FROM deps AS builder
RUN corepack enable pnpm && corepack prepare pnpm@9.0.0 --activate && pnpm --filter @aiva/backend build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/backend/package.json ./package.json

USER nestjs

EXPOSE 4000

CMD ["node", "dist/server.js"]
