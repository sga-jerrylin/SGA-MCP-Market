FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/package.json
RUN corepack enable && pnpm install
COPY packages/frontend ./packages/frontend
WORKDIR /app/packages/frontend
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
