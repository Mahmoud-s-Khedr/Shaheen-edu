import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('0.0.0.0'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),

  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),

  CORS_ORIGINS: Joi.string().required(),
  COOKIE_SECURE: Joi.boolean()
    .default(true)
    .when('NODE_ENV', { is: 'production', then: Joi.valid(true) }),
  COOKIE_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),
  COOKIE_SECRET: Joi.string().min(32).required(),
  API_DOCS_ENABLED: Joi.boolean().optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: Joi.number().positive().default(2_592_000),
  JWT_PARENT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_PARENT_ACCESS_TTL_SECONDS: Joi.number().positive().default(1800),

  NATIONAL_ID_HMAC_SECRET: Joi.string().min(32).required(),
  NATIONAL_ID_ENCRYPTION_KEY: Joi.string().min(32).required(),
  NATIONAL_ID_KEY_VERSION: Joi.number().integer().positive().default(1),

  BUNNY_STORAGE_S3_ENDPOINT: Joi.string().uri().required(),
  BUNNY_STORAGE_BUCKET: Joi.string().required(),
  BUNNY_STORAGE_ACCESS_KEY_ID: Joi.string().required(),
  BUNNY_STORAGE_SECRET_ACCESS_KEY: Joi.string().required(),
  BUNNY_STORAGE_PULL_ZONE_URL: Joi.string().uri().required(),
  BUNNY_STORAGE_TOKEN_KEY: Joi.string().min(16).required(),
  ASSET_URL_TTL_SECONDS: Joi.number().integer().min(30).default(300),
  ASSET_UPLOAD_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),
  ASSET_IMAGE_MAX_BYTES: Joi.number().integer().positive().default(10485760),
  ASSET_DOCUMENT_MAX_BYTES: Joi.number().integer().positive().default(26214400),
  ASSET_DOWNLOAD_MAX_BYTES: Joi.number()
    .integer()
    .positive()
    .default(104857600),

  BUNNY_STREAM_LIBRARY_ID: Joi.string().required(),
  BUNNY_STREAM_API_KEY: Joi.string().required(),
  BUNNY_STREAM_READ_ONLY_KEY: Joi.string().required(),
  BUNNY_STREAM_PLAYER_TOKEN_KEY: Joi.string().required(),
  BUNNY_STREAM_UPLOAD_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .default(10800),
  BUNNY_STREAM_PLAYBACK_TTL_SECONDS: Joi.number()
    .integer()
    .min(30)
    .default(300),

  RATE_LIMIT_GLOBAL_LIMIT: Joi.number().integer().positive().default(30),
  RATE_LIMIT_GLOBAL_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(60),
  RATE_LIMIT_AUTH_ROUTE_LIMIT: Joi.number().integer().positive().default(10),
  RATE_LIMIT_AUTH_ROUTE_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(60),
  RATE_LIMIT_STUDENT_LOGIN_MAX_ATTEMPTS: Joi.number()
    .integer()
    .positive()
    .default(5),
  RATE_LIMIT_STUDENT_LOGIN_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(900),
  RATE_LIMIT_ADMIN_LOGIN_MAX_ATTEMPTS: Joi.number()
    .integer()
    .positive()
    .default(5),
  RATE_LIMIT_ADMIN_LOGIN_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(900),
  RATE_LIMIT_PARTNER_LOGIN_MAX_ATTEMPTS: Joi.number()
    .integer()
    .positive()
    .default(5),
  RATE_LIMIT_PARTNER_LOGIN_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(900),
  RATE_LIMIT_PARENT_LOGIN_MAX_ATTEMPTS: Joi.number()
    .integer()
    .positive()
    .default(3),
  RATE_LIMIT_PARENT_LOGIN_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(1800),
  RATE_LIMIT_REFRESH_MAX_ATTEMPTS: Joi.number()
    .integer()
    .positive()
    .default(20),
  RATE_LIMIT_REFRESH_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(900),
  RATE_LIMIT_PASSWORD_CHANGE_MAX_ATTEMPTS: Joi.number()
    .integer()
    .positive()
    .default(5),
  RATE_LIMIT_PASSWORD_CHANGE_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(900),
  RATE_LIMIT_IP_MAX_ATTEMPTS: Joi.number().integer().positive().default(20),
  RATE_LIMIT_IP_WINDOW_SECONDS: Joi.number().integer().positive().default(900),
  PLATFORM_COMPARISON_MIN_SAMPLE: Joi.number().integer().min(1).default(10),
  OPENROUTER_API_KEY: Joi.string().min(1).optional(),
  AI_QUESTION_IMPORT_MODEL: Joi.string().min(1).optional(),
  AI_QUESTION_EXPLANATION_MODEL: Joi.string().min(1).optional(),
  AI_QUIZ_PLANNING_MODEL: Joi.string().min(1).optional(),
  AI_ANSWER_GRADING_MODEL: Joi.string().min(1).optional(),
  AI_SPEECH_TO_TEXT_MODEL: Joi.string()
    .min(1)
    .default('openai/whisper-large-v3'),
  AI_SPEECH_TO_TEXT_MAX_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(26214400)
    .default(10485760),
  AI_PDF_TRANSCRIPTION_MODEL: Joi.string().min(1).optional(),
  AI_PDF_TRANSCRIPTION_FALLBACK_MODEL: Joi.string().min(1).optional(),
  AI_PDF_TRANSCRIPTION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(120000),
  AI_PDF_MAX_PAGES: Joi.number().integer().min(1).max(2000).default(500),
  AI_WORKER_CONCURRENCY: Joi.number().integer().min(1).max(10).default(2),
  AI_QUESTION_IMPORT_OCR_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(8),
  AI_QUESTION_IMPORT_EXTRACTION_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(6),
  AI_QUESTION_IMPORT_CANDIDATE_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(6),
  AI_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(60000),
  AI_SEGMENTATION_SPLIT_THRESHOLD_TOKENS: Joi.number()
    .integer()
    .min(1000)
    .max(1000000)
    .default(8000),
  AI_SEGMENTATION_CHILD_TARGET_TOKENS: Joi.number()
    .integer()
    .min(1000)
    .max(500000)
    .default(4000),
  AI_PDF_SPLIT_OVERLAP_PAGES: Joi.number().integer().min(0).max(20).default(2),
  // Accepted during the configuration migration; token thresholds now control splitting.
  AI_SEGMENTATION_MAX_CHARACTERS: Joi.number()
    .integer()
    .min(1000)
    .max(1000000)
    .default(500000),
  AI_EXTRACTION_TARGET_TOKENS: Joi.number()
    .integer()
    .min(1000)
    .max(500000)
    .default(30000),
  AI_EXTRACTION_MAX_QUESTIONS: Joi.number()
    .integer()
    .min(1)
    .max(25)
    .default(10),
  // Accepted during the extraction-budget migration; token budgets now control chunking.
  AI_EXTRACTION_MAX_CHARACTERS: Joi.number()
    .integer()
    .min(1000)
    .max(500000)
    .default(80000),
});
