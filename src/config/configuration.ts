export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  trustProxyHops: number;
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
  storage: {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    pullZoneUrl: string;
    tokenKey: string;
    urlTtlSeconds: number;
    uploadTtlSeconds: number;
    imageMaxBytes: number;
    documentMaxBytes: number;
    downloadMaxBytes: number;
  };
  stream: {
    libraryId: string;
    apiKey: string;
    readOnlyKey: string;
    playerTokenKey: string;
    uploadTtlSeconds: number;
    playbackTtlSeconds: number;
  };
  rateLimit: {
    global: { limit: number; windowSeconds: number };
    authRoute: { limit: number; windowSeconds: number };
    identifier: {
      studentLogin: { maxAttempts: number; windowSeconds: number };
      adminLogin: { maxAttempts: number; windowSeconds: number };
      partnerLogin: { maxAttempts: number; windowSeconds: number };
      parentLogin: { maxAttempts: number; windowSeconds: number };
      refresh: { maxAttempts: number; windowSeconds: number };
      passwordChange: { maxAttempts: number; windowSeconds: number };
    };
    ip: { maxAttempts: number; windowSeconds: number };
  };
  platformComparisonMinSample: number;
  commerce: {
    paymobBaseUrl: string;
    paymobSecretKey: string;
    paymobPublicKey: string;
    paymobHmacSecret: string;
    paymobIntegrationIds: number[];
    paymobNotificationUrl: string;
    paymobRedirectUrl: string;
    paymobTimeoutMs: number;
    paymobOrderExpirySeconds: number;
    manualOrderExpirySeconds: number;
  };
  ai: {
    openRouterApiKey: string;
    questionImportModel: string;
    questionExplanationModel: string;
    quizPlanningModel: string;
    answerGradingModel: string;
    speechToTextModel: string;
    speechToTextMaxBytes: number;
    pdfTranscriptionModel: string;
    pdfTranscriptionFallbackModel: string;
    workerConcurrency: number;
    questionImportOcrConcurrency: number;
    questionImportExtractionConcurrency: number;
    questionImportCandidateConcurrency: number;
    requestTimeoutMs: number;
    pdfTranscriptionTimeoutMs: number;
    pdfMaxPages: number;
    segmentationSplitThresholdTokens: number;
    segmentationChildTargetTokens: number;
    extractionTargetTokens: number;
    extractionMaxQuestions: number;
    pdfSplitOverlapPages: number;
  };
}

const envInteger = (name: string, fallback: number): number =>
  parseInt(process.env[name] ?? String(fallback), 10);

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  trustProxyHops: envInteger('TRUST_PROXY_HOPS', 0),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieSecure: (process.env.COOKIE_SECURE ?? 'true') === 'true',
  cookieSameSite: (process.env.COOKIE_SAME_SITE ??
    'lax') as AppConfig['cookieSameSite'],
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
  storage: {
    endpoint: process.env.BUNNY_STORAGE_S3_ENDPOINT ?? '',
    bucket: process.env.BUNNY_STORAGE_BUCKET ?? '',
    accessKeyId: process.env.BUNNY_STORAGE_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.BUNNY_STORAGE_SECRET_ACCESS_KEY ?? '',
    pullZoneUrl: process.env.BUNNY_STORAGE_PULL_ZONE_URL ?? '',
    tokenKey: process.env.BUNNY_STORAGE_TOKEN_KEY ?? '',
    urlTtlSeconds: parseInt(process.env.ASSET_URL_TTL_SECONDS ?? '300', 10),
    uploadTtlSeconds: parseInt(
      process.env.ASSET_UPLOAD_TTL_SECONDS ?? '900',
      10,
    ),
    imageMaxBytes: parseInt(
      process.env.ASSET_IMAGE_MAX_BYTES ?? '10485760',
      10,
    ),
    documentMaxBytes: parseInt(
      process.env.ASSET_DOCUMENT_MAX_BYTES ?? '26214400',
      10,
    ),
    downloadMaxBytes: parseInt(
      process.env.ASSET_DOWNLOAD_MAX_BYTES ?? '104857600',
      10,
    ),
  },
  stream: {
    libraryId: process.env.BUNNY_STREAM_LIBRARY_ID ?? '',
    apiKey: process.env.BUNNY_STREAM_API_KEY ?? '',
    readOnlyKey: process.env.BUNNY_STREAM_READ_ONLY_KEY ?? '',
    playerTokenKey: process.env.BUNNY_STREAM_PLAYER_TOKEN_KEY ?? '',
    uploadTtlSeconds: parseInt(
      process.env.BUNNY_STREAM_UPLOAD_TTL_SECONDS ?? '10800',
      10,
    ),
    playbackTtlSeconds: parseInt(
      process.env.BUNNY_STREAM_PLAYBACK_TTL_SECONDS ?? '300',
      10,
    ),
  },
  rateLimit: {
    global: {
      limit: envInteger('RATE_LIMIT_GLOBAL_LIMIT', 30),
      windowSeconds: envInteger('RATE_LIMIT_GLOBAL_WINDOW_SECONDS', 60),
    },
    authRoute: {
      limit: envInteger('RATE_LIMIT_AUTH_ROUTE_LIMIT', 10),
      windowSeconds: envInteger('RATE_LIMIT_AUTH_ROUTE_WINDOW_SECONDS', 60),
    },
    identifier: {
      studentLogin: {
        maxAttempts: envInteger('RATE_LIMIT_STUDENT_LOGIN_MAX_ATTEMPTS', 5),
        windowSeconds: envInteger(
          'RATE_LIMIT_STUDENT_LOGIN_WINDOW_SECONDS',
          900,
        ),
      },
      adminLogin: {
        maxAttempts: envInteger('RATE_LIMIT_ADMIN_LOGIN_MAX_ATTEMPTS', 5),
        windowSeconds: envInteger('RATE_LIMIT_ADMIN_LOGIN_WINDOW_SECONDS', 900),
      },
      partnerLogin: {
        maxAttempts: envInteger('RATE_LIMIT_PARTNER_LOGIN_MAX_ATTEMPTS', 5),
        windowSeconds: envInteger(
          'RATE_LIMIT_PARTNER_LOGIN_WINDOW_SECONDS',
          900,
        ),
      },
      parentLogin: {
        maxAttempts: envInteger('RATE_LIMIT_PARENT_LOGIN_MAX_ATTEMPTS', 3),
        windowSeconds: envInteger(
          'RATE_LIMIT_PARENT_LOGIN_WINDOW_SECONDS',
          1800,
        ),
      },
      refresh: {
        maxAttempts: envInteger('RATE_LIMIT_REFRESH_MAX_ATTEMPTS', 20),
        windowSeconds: envInteger('RATE_LIMIT_REFRESH_WINDOW_SECONDS', 900),
      },
      passwordChange: {
        maxAttempts: envInteger('RATE_LIMIT_PASSWORD_CHANGE_MAX_ATTEMPTS', 5),
        windowSeconds: envInteger(
          'RATE_LIMIT_PASSWORD_CHANGE_WINDOW_SECONDS',
          900,
        ),
      },
    },
    ip: {
      maxAttempts: envInteger('RATE_LIMIT_IP_MAX_ATTEMPTS', 20),
      windowSeconds: envInteger('RATE_LIMIT_IP_WINDOW_SECONDS', 900),
    },
  },
  platformComparisonMinSample: envInteger('PLATFORM_COMPARISON_MIN_SAMPLE', 10),
  commerce: {
    paymobBaseUrl: process.env.PAYMOB_BASE_URL ?? 'https://accept.paymob.com',
    paymobSecretKey: process.env.PAYMOB_SECRET_KEY ?? '',
    paymobPublicKey: process.env.PAYMOB_PUBLIC_KEY ?? '',
    paymobHmacSecret: process.env.PAYMOB_HMAC_SECRET ?? '',
    paymobIntegrationIds: (process.env.PAYMOB_INTEGRATION_IDS ?? '')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter(Number.isInteger),
    paymobNotificationUrl: process.env.PAYMOB_NOTIFICATION_URL ?? '',
    paymobRedirectUrl: process.env.PAYMOB_REDIRECT_URL ?? '',
    paymobTimeoutMs: envInteger('PAYMOB_TIMEOUT_MS', 15_000),
    paymobOrderExpirySeconds: envInteger('PAYMOB_ORDER_EXPIRY_SECONDS', 1800),
    manualOrderExpirySeconds: envInteger('MANUAL_ORDER_EXPIRY_SECONDS', 86_400),
  },
  ai: {
    openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
    questionImportModel: process.env.AI_QUESTION_IMPORT_MODEL ?? '',
    questionExplanationModel:
      process.env.AI_QUESTION_EXPLANATION_MODEL ??
      process.env.AI_QUESTION_IMPORT_MODEL ??
      '',
    quizPlanningModel:
      process.env.AI_QUIZ_PLANNING_MODEL ??
      process.env.AI_QUESTION_EXPLANATION_MODEL ??
      process.env.AI_QUESTION_IMPORT_MODEL ??
      '',
    answerGradingModel:
      process.env.AI_ANSWER_GRADING_MODEL ??
      process.env.AI_QUESTION_EXPLANATION_MODEL ??
      process.env.AI_QUESTION_IMPORT_MODEL ??
      '',
    speechToTextModel:
      process.env.AI_SPEECH_TO_TEXT_MODEL ?? 'openai/whisper-large-v3',
    speechToTextMaxBytes: envInteger('AI_SPEECH_TO_TEXT_MAX_BYTES', 10485760),
    pdfTranscriptionModel: process.env.AI_PDF_TRANSCRIPTION_MODEL ?? '',
    pdfTranscriptionFallbackModel:
      process.env.AI_PDF_TRANSCRIPTION_FALLBACK_MODEL ?? '',
    workerConcurrency: envInteger('AI_WORKER_CONCURRENCY', 2),
    questionImportOcrConcurrency: envInteger(
      'AI_QUESTION_IMPORT_OCR_CONCURRENCY',
      8,
    ),
    questionImportExtractionConcurrency: envInteger(
      'AI_QUESTION_IMPORT_EXTRACTION_CONCURRENCY',
      6,
    ),
    questionImportCandidateConcurrency: envInteger(
      'AI_QUESTION_IMPORT_CANDIDATE_CONCURRENCY',
      6,
    ),
    requestTimeoutMs: envInteger('AI_REQUEST_TIMEOUT_MS', 60_000),
    pdfTranscriptionTimeoutMs: envInteger(
      'AI_PDF_TRANSCRIPTION_TIMEOUT_MS',
      120_000,
    ),
    pdfMaxPages: envInteger('AI_PDF_MAX_PAGES', 500),
    segmentationSplitThresholdTokens: envInteger(
      'AI_SEGMENTATION_SPLIT_THRESHOLD_TOKENS',
      8_000,
    ),
    segmentationChildTargetTokens: envInteger(
      'AI_SEGMENTATION_CHILD_TARGET_TOKENS',
      4_000,
    ),
    extractionTargetTokens: envInteger('AI_EXTRACTION_TARGET_TOKENS', 30_000),
    extractionMaxQuestions: envInteger('AI_EXTRACTION_MAX_QUESTIONS', 10),
    pdfSplitOverlapPages: envInteger('AI_PDF_SPLIT_OVERLAP_PAGES', 2),
  },
});
