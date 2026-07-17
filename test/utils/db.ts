import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as argon2 from 'argon2';
import { PrismaService } from '../../src/database/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { Role, AccountStatus } from '../../src/common/types/roles.enum';

/** Deletes all app-owned rows, in FK-safe order. Run at the start of each e2e suite. */
export async function cleanDatabase(
  app: NestFastifyApplication,
): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.adminAuditLog.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.parentAccessSession.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.partnerProfile.deleteMany();
  await prisma.user.deleteMany();
}

export async function flushTestRedis(
  app: NestFastifyApplication,
): Promise<void> {
  const redis = app.get(RedisService);
  await redis.client.flushdb();
}

export async function seedSuperAdmin(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<{ id: string; loginIdentifier: string }> {
  const prisma = app.get(PrismaService);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      role: Role.SUPER_ADMIN,
      status: AccountStatus.ACTIVE,
      loginIdentifier: email.toLowerCase(),
      passwordHash,
    },
  });
  return { id: user.id, loginIdentifier: user.loginIdentifier };
}
