import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration. The datasource URL remains in schema.prisma while
 * this project is on Prisma 6; Prisma 7 moves that setting here as part of its
 * separate major-version migration.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
});
