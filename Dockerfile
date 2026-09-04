FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache poppler-utils
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate
# TypeScript compilation exceeds Node's automatic ~512 MB heap on small test
# instances. Scope the allowance to this build layer so application containers
# retain Node's normal runtime memory settings.
RUN rm -rf dist tsconfig.build.tsbuildinfo && NODE_OPTIONS=--max-old-space-size=1024 pnpm build

# Local development image. It intentionally retains development dependencies so
# migrations and the TypeScript seed script can run inside the Compose stack.
FROM build AS development
ENV NODE_ENV=development
EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm prisma:seed && node dist/main"]

# One-shot production migration/bootstrap jobs need the Prisma CLI, but the
# long-running API and worker images must retain production dependencies only.
FROM build AS migration
ENV NODE_ENV=production
USER node
# Cache the package-manager version pinned in package.json for the same
# non-root user that executes migrations and the production bootstrap job.
RUN corepack install
CMD ["pnpm", "prisma:migrate:deploy"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache poppler-utils
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/main"]
