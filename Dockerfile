# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:stable-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/demo/package.json apps/demo/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/editor/package.json packages/editor/package.json
COPY packages/prefixes/package.json packages/prefixes/package.json
COPY packages/renderers/package.json packages/renderers/package.json
COPY packages/charts/package.json packages/charts/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build -w @ldforge/demo

FROM ${NGINX_IMAGE} AS runtime
LABEL org.opencontainers.image.source="https://github.com/mightymax/ldforge"
LABEL org.opencontainers.image.licenses="EUPL-1.2"
COPY deploy/container/nginx.conf /etc/nginx/nginx.conf
COPY LICENSE /usr/share/licenses/ldforge/LICENSE
COPY deploy/container/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/container/start.sh /usr/local/bin/ldforge-start
COPY --from=build /app/apps/demo/dist /opt/ldforge-site
USER 101:101
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/ldforge-start"]
CMD ["nginx", "-g", "daemon off;"]
