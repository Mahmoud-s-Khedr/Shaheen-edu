export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
  correlationId: string;
  method: HttpMethod;
  path: string;
}

export interface UserSession {
  id?: string;
  accessToken?: string;
}

export interface JourneyContext {
  runId: string;
  created: Record<string, string[]>;
  superAdmin: UserSession;
  admin: UserSession & { email?: string; password?: string };
  partner: UserSession & { email?: string; password?: string };
  students: Array<
    UserSession & {
      phone: string;
      password: string;
      nationalId: string;
      parentPhone: string;
    }
  >;
  parent: UserSession & { activeStudentId?: string };
  academic: Record<string, string | number | undefined>;
}

export interface JourneyResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  failedStep?: string;
  correlationIds: string[];
  created: Record<string, string[]>;
  error?: unknown;
}

export interface JourneyDefinition {
  id: string;
  name: string;
  category: 'infrastructure' | 'auth' | 'content';
  dependsOn?: string[];
  run: (runtime: JourneyRuntime) => Promise<void>;
}

export interface JourneyRuntime {
  context: JourneyContext;
  step: (label: string, action: () => Promise<void>) => Promise<void>;
  clients: Record<string, import('./api-client.js').ApiClient>;
  factory: import('./data-factory.js').DataFactory;
  options: { verbose: boolean };
  environment: import('./environment.js').JourneyEnvironment;
}
