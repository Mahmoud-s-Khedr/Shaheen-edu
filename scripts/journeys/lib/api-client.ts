import { randomUUID } from 'node:crypto';
import { CookieJar } from './cookie-jar.js';
import type { ApiResponse, HttpMethod, OperationRecord } from './types.js';

export class ApiClient {
  readonly jar = new CookieJar();
  accessToken?: string;
  constructor(
    private readonly config: {
      baseUrl: string;
      apiPrefix: string;
      timeoutMs: number;
    },
    readonly name: string,
    private readonly onResponse?: (correlationId: string) => void,
    private readonly onOperation?: (record: OperationRecord) => void,
  ) {}

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: {
      expected?: number | number[];
      accessToken?: string;
      rawPath?: boolean;
      /** Send an already-serialized body, for example a signed webhook. */
      rawBody?: BodyInit;
      /** Additional request headers. Values here take precedence over defaults. */
      headers?: Record<string, string>;
      /** Administrative cleanup must never satisfy acceptance coverage. */
      track?: boolean;
    } = {},
  ): Promise<ApiResponse<T>> {
    const correlationId = randomUUID();
    const headers = new Headers({
      accept: 'application/json',
      'x-correlation-id': correlationId,
    });
    const cookie = this.jar.header();
    if (cookie) headers.set('cookie', cookie);
    const token = options.accessToken ?? this.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (body !== undefined && options.rawBody === undefined)
      headers.set('content-type', 'application/json');
    for (const [name, value] of Object.entries(options.headers ?? {}))
      headers.set(name, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const absolutePath = options.rawPath
      ? path
      : `${this.config.apiPrefix}${path}`;
    try {
      const started = performance.now();
      const response = await fetch(`${this.config.baseUrl}${absolutePath}`, {
        method,
        headers,
        body:
          options.rawBody ??
          (body === undefined ? undefined : JSON.stringify(body)),
        signal: controller.signal,
      });
      this.jar.absorb(response.headers);
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      const result: ApiResponse<T> = {
        status: response.status,
        body: parsed as T,
        headers: response.headers,
        correlationId,
        method,
        path: absolutePath,
      };
      if (options.track !== false)
        this.onOperation?.({
          method,
          path: absolutePath,
          status: response.status,
          durationMs: performance.now() - started,
          correlationId,
          client: this.name,
          body: parsed,
        });
      this.onResponse?.(correlationId);
      const expected = options.expected;
      if (expected !== undefined) {
        const allowed = Array.isArray(expected) ? expected : [expected];
        if (!allowed.includes(result.status))
          throw Object.assign(
            new Error(
              `Expected ${allowed.join(' or ')}, received ${result.status}`,
            ),
            { response: result },
          );
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Uploads a single file. Asset uploads use the direct Bunny authorization flow. */
  async upload<T>(
    path: string,
    file: { buffer: Buffer; filename: string; contentType: string },
    options: { expected?: number | number[]; accessToken?: string; fields?: Record<string, string>; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const assetMatch = path.match(/^\/admin\/assets\/upload\?kind=([^&]+)$/);
    const paymentProofMatch = path.match(/^\/student\/orders\/[^/]+\/payment-proof$/) || path.match(/^\/student\/orders\/[^/]+\/payment-submissions\/[^/]+\/resubmit$/);
    if (assetMatch || paymentProofMatch) {
      // The authorization call deliberately keeps the former upload URL and
      // multipart payload. Return authorization failures unchanged so callers
      // can still assert the legacy 400/403 responses.
      const authorization = await this.multipartUpload<any>(path, file, { accessToken: options.accessToken, fields: options.fields, headers: options.headers });
      if (authorization.status !== 201) return authorization as ApiResponse<T>;
      const upload = authorization.body.upload;
      const direct = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file.buffer });
      if (!direct.ok) throw new Error(`Direct Bunny upload failed with ${direct.status}`);
      if (assetMatch) return this.request<T>('POST', `/admin/assets/${authorization.body.asset.id}/complete`, undefined, { expected: options.expected, accessToken: options.accessToken, headers: options.headers });
      return this.request<T>('POST', `${path}/complete`, { assetId: authorization.body.asset.id, ...options.fields }, { expected: options.expected, accessToken: options.accessToken, headers: options.headers });
    }
    return this.multipartUpload<T>(path, file, options);
  }

  private async multipartUpload<T>(
    path: string,
    file: { buffer: Buffer; filename: string; contentType: string },
    options: { expected?: number | number[]; accessToken?: string; fields?: Record<string, string>; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const correlationId = randomUUID();
    const headers = new Headers({
      accept: 'application/json',
      'x-correlation-id': correlationId,
    });
    const cookie = this.jar.header();
    if (cookie) headers.set('cookie', cookie);
    const token = options.accessToken ?? this.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    // Let fetch set the multipart boundary; do not set content-type manually.
    const form = new FormData();
    for (const [name, value] of Object.entries(options.fields ?? {})) form.append(name, value);
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
      file.filename,
    );
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const absolutePath = `${this.config.apiPrefix}${path}`;
    try {
      const started = performance.now();
      const response = await fetch(`${this.config.baseUrl}${absolutePath}`, {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });
      this.jar.absorb(response.headers);
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      const result: ApiResponse<T> = {
        status: response.status,
        body: parsed as T,
        headers: response.headers,
        correlationId,
        method: 'POST',
        path: absolutePath,
      };
      this.onOperation?.({
        method: 'POST',
        path: absolutePath,
        status: response.status,
        durationMs: performance.now() - started,
        correlationId,
        client: this.name,
        body: parsed,
      });
      this.onResponse?.(correlationId);
      const expected = options.expected;
      if (expected !== undefined) {
        const allowed = Array.isArray(expected) ? expected : [expected];
        if (!allowed.includes(result.status))
          throw Object.assign(
            new Error(
              `Expected ${allowed.join(' or ')}, received ${result.status}`,
            ),
            { response: result },
          );
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
