export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  corsOrigins: string[];
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
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
  storage: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; pullZoneUrl: string; tokenKey: string; urlTtlSeconds: number; uploadTtlSeconds: number; imageMaxBytes: number; documentMaxBytes: number; downloadMaxBytes: number };
  stream: { libraryId: string; apiKey: string; readOnlyKey: string; playerTokenKey: string; uploadTtlSeconds: number; playbackTtlSeconds: number };
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
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as AppConfig['cookieSameSite'],
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
  storage: {
    endpoint: process.env.BUNNY_STORAGE_S3_ENDPOINT ?? '', bucket: process.env.BUNNY_STORAGE_BUCKET ?? '', accessKeyId: process.env.BUNNY_STORAGE_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.BUNNY_STORAGE_SECRET_ACCESS_KEY ?? '', pullZoneUrl: process.env.BUNNY_STORAGE_PULL_ZONE_URL ?? '', tokenKey: process.env.BUNNY_STORAGE_TOKEN_KEY ?? '',
    urlTtlSeconds: parseInt(process.env.ASSET_URL_TTL_SECONDS ?? '300', 10), uploadTtlSeconds: parseInt(process.env.ASSET_UPLOAD_TTL_SECONDS ?? '900', 10), imageMaxBytes: parseInt(process.env.ASSET_IMAGE_MAX_BYTES ?? '10485760', 10), documentMaxBytes: parseInt(process.env.ASSET_DOCUMENT_MAX_BYTES ?? '52428800', 10), downloadMaxBytes: parseInt(process.env.ASSET_DOWNLOAD_MAX_BYTES ?? '104857600', 10),
  },
  stream: {
    libraryId: process.env.BUNNY_STREAM_LIBRARY_ID ?? '', apiKey: process.env.BUNNY_STREAM_API_KEY ?? '', readOnlyKey: process.env.BUNNY_STREAM_READ_ONLY_KEY ?? '', playerTokenKey: process.env.BUNNY_STREAM_PLAYER_TOKEN_KEY ?? '', uploadTtlSeconds: parseInt(process.env.BUNNY_STREAM_UPLOAD_TTL_SECONDS ?? '10800', 10), playbackTtlSeconds: parseInt(process.env.BUNNY_STREAM_PLAYBACK_TTL_SECONDS ?? '300', 10),
  },
});
