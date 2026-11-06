# Builds and runs the app on Coolify. Images and packages come from the company Nexus, not the internet.
FROM registry.digitalx.srt/node:24.22.2-bookworm-slim AS deps
WORKDIR /app
ENV NODE_EXTRA_CA_CERTS=/app/certs/srt-platform-root-ca.crt
COPY package.json package-lock.json .npmrc ./
COPY certs ./certs
RUN npm ci --audit=false

FROM registry.digitalx.srt/node:24.22.2-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM registry.digitalx.srt/node:24.22.2-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
