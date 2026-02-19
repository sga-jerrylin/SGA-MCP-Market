FROM node:20-alpine AS builder
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY packages/backend/package.json ./package.json
RUN npm install
COPY packages/backend ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
EXPOSE 3100
CMD ["node", "dist/main.js"]
