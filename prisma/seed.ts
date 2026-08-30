/* eslint-disable no-console */
import { PrismaClient, Role, AccountStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

interface RefundPolicySeed {
  eligibilityWindowDays: number;
  maximumConsumptionBps: number;
}

function requiredProductionInteger(
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(
      `FATAL: ${name} must be an integer between ${minimum} and ${maximum} for production bootstrap.`,
    );
  }
  const value = Number(raw);
  if (value < minimum || value > maximum) {
    throw new Error(
      `FATAL: ${name} must be an integer between ${minimum} and ${maximum} for production bootstrap.`,
    );
  }
  return value;
}

function refundPolicySeed(): RefundPolicySeed {
  if (process.env.NODE_ENV !== 'production') {
    return { eligibilityWindowDays: 7, maximumConsumptionBps: 1_000 };
  }
  if (process.env.ALLOW_PRODUCTION_BOOTSTRAP !== 'true') {
    throw new Error(
      'FATAL: refusing to seed production. Set ALLOW_PRODUCTION_BOOTSTRAP=true for the one-off bootstrap job.',
    );
  }
  return {
    eligibilityWindowDays: requiredProductionInteger(
      'INITIAL_REFUND_ELIGIBILITY_WINDOW_DAYS',
      1,
      365,
    ),
    maximumConsumptionBps: requiredProductionInteger(
      'INITIAL_REFUND_MAXIMUM_CONSUMPTION_BPS',
      1,
      10_000,
    ),
  };
}

async function main() {
  const rawEmail = process.env.SUPER_ADMIN_EMAIL;
  const rawPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!rawEmail || !rawPassword) {
    console.error(
      'FATAL: SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in the environment to run the seed script.',
    );
    process.exit(1);
  }
  if (rawPassword.length < 12) {
    console.error(
      'FATAL: SUPER_ADMIN_PASSWORD must contain at least 12 characters.',
    );
    process.exit(1);
  }

  const policySeed = refundPolicySeed();
  const loginIdentifier = rawEmail.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { loginIdentifier } });

  if (existing) {
    if (existing.role !== Role.SUPER_ADMIN) {
      console.error(
        `FATAL: loginIdentifier "${loginIdentifier}" already exists with role ${existing.role}, not SUPER_ADMIN. Refusing to proceed.`,
      );
      process.exit(1);
    }
    const policy = await prisma.refundPolicy.findFirst({
      where: { isActive: true },
    });
    if (!policy) {
      await prisma.refundPolicy.create({
        data: { version: 1, ...policySeed, updatedById: existing.id },
      });
    }
    console.log(
      'Super admin already exists; ensured the configured refund policy.',
    );
    return;
  }

  const passwordHash = await argon2.hash(rawPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        role: Role.SUPER_ADMIN,
        status: AccountStatus.ACTIVE,
        loginIdentifier,
        passwordHash,
      },
    });
    await tx.refundPolicy.create({
      data: { version: 1, ...policySeed, updatedById: created.id },
    });
    await tx.adminAuditLog.create({
      data: {
        actorUserId: created.id,
        action: 'SUPER_ADMIN_SEEDED',
        targetType: 'User',
        targetId: created.id,
        metadata: { source: 'seed' },
      },
    });
  });

  console.log(`Super admin seeded successfully for "${loginIdentifier}".`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
