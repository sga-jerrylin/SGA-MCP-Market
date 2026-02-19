FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/backend/package.json ./packages/backend/package.json
RUN corepack enable && pnpm install
COPY packages/backend ./packages/backend
WORKDIR /app/packages/backend
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/package.json ./package.json
EXPOSE 3100
CMD ["node", "dist/main.js"]
