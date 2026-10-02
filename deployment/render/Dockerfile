# Multi-stage production build for AIVA Private Backend on Render
FROM node:20-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

# Dependencies Stage
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile

# Build Stage
FROM dependencies AS builder
COPY backend/ ./backend/
COPY packages/ ./packages/
RUN pnpm db:generate
RUN pnpm --filter @aiva/backend build

# Production Stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/package.json ./backend/package.json

EXPOSE 10000

CMD ["node", "backend/dist/server.js"]
