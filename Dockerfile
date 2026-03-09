# Stage: dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Stage: dev (hot reload, development)
FROM node:22-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 3000
ENV HOSTNAME="0.0.0.0"
CMD ["npm", "run", "dev"]

# Stage: build
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy DATABASE_URL needed for Next.js build (not used at runtime)
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
RUN npx prisma generate && npm run build
# Generate SQL init script from Prisma schema
RUN npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script | grep -v '^\[dotenv' > prisma/init.sql

# Stage: production (minimal image)
FROM node:22-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001

COPY --from=build --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=build --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=build --chown=appuser:appgroup /app/public ./public
COPY --from=build --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=build --chown=appuser:appgroup /app/src/generated ./src/generated
COPY --from=build --chown=appuser:appgroup /app/docker-entrypoint.sh ./docker-entrypoint.sh
# Install mariadb + bcryptjs, then remove npm/npx (not needed at runtime, eliminates tar CVEs)
RUN mkdir /tmp/dbpkg && cd /tmp/dbpkg && npm init -y >/dev/null 2>&1 \
    && npm install mariadb bcryptjs >/dev/null 2>&1 \
    && cp -r /tmp/dbpkg/node_modules/* /app/node_modules/ \
    && rm -rf /tmp/dbpkg /root/.npm \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER appuser
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
