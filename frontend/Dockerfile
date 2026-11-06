# syntax=docker/dockerfile:1

ARG NODE_VERSION=22
ARG NGINX_VERSION=1.28

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN touch .env.deploy
RUN npm run build

FROM nginx:${NGINX_VERSION}-alpine AS runtime
COPY --from=build /app/.env.deploy /etc/hangmu/.env
COPY --chmod=0755 nginx/05-load-env.envsh /docker-entrypoint.d/05-load-env.envsh
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
