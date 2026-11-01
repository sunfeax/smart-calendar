FROM node:24-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
WORKDIR /app/apps/backend
COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci
COPY apps/backend/ ./
RUN npx prisma generate && npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/backend
COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/apps/backend/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
