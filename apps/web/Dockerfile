# Frontend Dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Dependencies & Source stage
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web ./apps/web
COPY packages ./packages

RUN corepack enable pnpm && corepack prepare pnpm@9.0.0 --activate && pnpm install --frozen-lockfile

# Builder stage
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm && corepack prepare pnpm@9.0.0 --activate && pnpm --filter @aiva/web build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start"]
