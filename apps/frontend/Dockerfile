FROM node:24-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
WORKDIR /app/apps/frontend
COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN npm ci
COPY apps/frontend/ ./
RUN npx ng build

FROM caddy:2-alpine
COPY apps/frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/frontend/dist/frontend/browser /srv
