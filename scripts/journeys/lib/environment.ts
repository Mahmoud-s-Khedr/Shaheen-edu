export interface JourneyEnvironment {
  baseUrl: string;
  apiPrefix: string;
  superAdminEmail: string;
  superAdminPassword: string;
  timeoutMs: number;
  target: 'local' | 'staging';
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadEnvironment(): JourneyEnvironment {
  if (process.env.JOURNEY_ALLOW_MUTATIONS !== 'true') {
    throw new Error('Refusing to run: set JOURNEY_ALLOW_MUTATIONS=true');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run with NODE_ENV=production');
  const baseUrl = required('JOURNEY_BASE_URL').replace(/\/$/, '');
  const host = new URL(baseUrl).hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const productionHost = /(^|\.)(prod|production)(\.|$)|\.com$|\.net$|\.org$/.test(host);
  if (productionHost) throw new Error(`Refusing production-like target host: ${host}`);
  const target = (process.env.JOURNEY_TARGET ?? 'local') as 'local' | 'staging';
  if (!localHosts.has(host)) {
    if (target !== 'staging' || process.env.JOURNEY_CONFIRM_STAGING_MUTATIONS !== 'true') {
      throw new Error('Non-local targets require JOURNEY_TARGET=staging and JOURNEY_CONFIRM_STAGING_MUTATIONS=true');
    }
  }
  if (target !== 'local' && target !== 'staging') throw new Error('JOURNEY_TARGET must be local or staging');
  const timeoutMs = Number(process.env.JOURNEY_REQUEST_TIMEOUT_MS ?? '10000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('JOURNEY_REQUEST_TIMEOUT_MS must be an integer between 1000 and 120000');
  return {
    baseUrl,
    apiPrefix: (process.env.JOURNEY_API_PREFIX ?? '/api/v1').replace(/\/$/, ''),
    superAdminEmail: required('JOURNEY_SUPER_ADMIN_EMAIL'),
    superAdminPassword: required('JOURNEY_SUPER_ADMIN_PASSWORD'),
    timeoutMs,
    target,
  };
}
