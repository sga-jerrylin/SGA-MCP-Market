FROM node:20-alpine AS builder
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY packages/frontend/package.json ./package.json
RUN npm install
COPY packages/frontend ./
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
