# Multi-stage build for the Next.js web app (standalone output).
# Deploy this on any Docker host (Render, Railway, Fly, a VPS). The background
# worker is optional and runs separately (see DEPLOY.md).

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Standalone server + static assets + i18n messages (dynamically imported).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/messages ./messages
EXPOSE 3000
CMD ["node", "server.js"]
