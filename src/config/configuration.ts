export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  corsOrigins: string[];
  cookieSecure: boolean;
  cookieSecret: string;
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    parentAccessSecret: string;
    parentAccessTtlSeconds: number;
  };
  nationalId: {
    hmacSecret: string;
    encryptionKey: string;
    keyVersion: number;
  };
  superAdmin: {
    email: string;
    password: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieSecure: (process.env.COOKIE_SECURE ?? 'true') === 'true',
  cookieSecret: process.env.COOKIE_SECRET ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS ?? '900', 10),
    refreshTtlSeconds: parseInt(
      process.env.JWT_REFRESH_TTL_SECONDS ?? '2592000',
      10,
    ),
    parentAccessSecret: process.env.JWT_PARENT_ACCESS_SECRET ?? '',
    parentAccessTtlSeconds: parseInt(
      process.env.JWT_PARENT_ACCESS_TTL_SECONDS ?? '1800',
      10,
    ),
  },
  nationalId: {
    hmacSecret: process.env.NATIONAL_ID_HMAC_SECRET ?? '',
    encryptionKey: process.env.NATIONAL_ID_ENCRYPTION_KEY ?? '',
    keyVersion: parseInt(process.env.NATIONAL_ID_KEY_VERSION ?? '1', 10),
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL ?? '',
    password: process.env.SUPER_ADMIN_PASSWORD ?? '',
  },
});
