FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache poppler-utils
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate
RUN rm -rf dist tsconfig.build.tsbuildinfo && pnpm build

# Local development image. It intentionally retains development dependencies so
# migrations and the TypeScript seed script can run inside the Compose stack.
FROM build AS development
ENV NODE_ENV=development
EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm prisma:seed && node dist/main"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache poppler-utils
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main"]
