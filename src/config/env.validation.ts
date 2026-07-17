import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('0.0.0.0'),

  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),

  CORS_ORIGINS: Joi.string().required(),
  COOKIE_SECURE: Joi.boolean().default(true),
  COOKIE_SECRET: Joi.string().min(32).required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: Joi.number().positive().default(2_592_000),
  JWT_PARENT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_PARENT_ACCESS_TTL_SECONDS: Joi.number().positive().default(1800),

  NATIONAL_ID_HMAC_SECRET: Joi.string().min(32).required(),
  NATIONAL_ID_ENCRYPTION_KEY: Joi.string().min(32).required(),
  NATIONAL_ID_KEY_VERSION: Joi.number().integer().positive().default(1),

  SUPER_ADMIN_EMAIL: Joi.string().email().required(),
  SUPER_ADMIN_PASSWORD: Joi.string().min(12).required(),
});
