import { randomUUID } from 'node:crypto';
import { CookieJar } from './cookie-jar.js';
import type { ApiResponse, HttpMethod } from './types.js';

export class ApiClient {
  readonly jar = new CookieJar();
  accessToken?: string;
  constructor(private readonly config: { baseUrl: string; apiPrefix: string; timeoutMs: number }, readonly name: string, private readonly onResponse?: (correlationId: string) => void) {}

  async request<T>(method: HttpMethod, path: string, body?: unknown, options: { expected?: number | number[]; accessToken?: string; rawPath?: boolean } = {}): Promise<ApiResponse<T>> {
    const correlationId = randomUUID();
    const headers = new Headers({ accept: 'application/json', 'x-correlation-id': correlationId });
    const cookie = this.jar.header();
    if (cookie) headers.set('cookie', cookie);
    const token = options.accessToken ?? this.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('content-type', 'application/json');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const absolutePath = options.rawPath ? path : `${this.config.apiPrefix}${path}`;
    try {
      const response = await fetch(`${this.config.baseUrl}${absolutePath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      this.jar.absorb(response.headers);
      const text = await response.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      const result: ApiResponse<T> = { status: response.status, body: parsed as T, headers: response.headers, correlationId, method, path: absolutePath };
      this.onResponse?.(correlationId);
      const expected = options.expected;
      if (expected !== undefined) {
        const allowed = Array.isArray(expected) ? expected : [expected];
        if (!allowed.includes(result.status)) throw Object.assign(new Error(`Expected ${allowed.join(' or ')}, received ${result.status}`), { response: result });
      }
      return result;
    } finally { clearTimeout(timeout); }
  }

  /** Uploads a single file as multipart/form-data (field name `file`); used by the Bunny Storage asset endpoints. */
  async upload<T>(path: string, file: { buffer: Buffer; filename: string; contentType: string }, options: { expected?: number | number[]; accessToken?: string } = {}): Promise<ApiResponse<T>> {
    const correlationId = randomUUID();
    const headers = new Headers({ accept: 'application/json', 'x-correlation-id': correlationId });
    const cookie = this.jar.header();
    if (cookie) headers.set('cookie', cookie);
    const token = options.accessToken ?? this.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    // Let fetch set the multipart boundary; do not set content-type manually.
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.contentType }), file.filename);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const absolutePath = `${this.config.apiPrefix}${path}`;
    try {
      const response = await fetch(`${this.config.baseUrl}${absolutePath}`, { method: 'POST', headers, body: form, signal: controller.signal });
      this.jar.absorb(response.headers);
      const text = await response.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      const result: ApiResponse<T> = { status: response.status, body: parsed as T, headers: response.headers, correlationId, method: 'POST', path: absolutePath };
      this.onResponse?.(correlationId);
      const expected = options.expected;
      if (expected !== undefined) {
        const allowed = Array.isArray(expected) ? expected : [expected];
        if (!allowed.includes(result.status)) throw Object.assign(new Error(`Expected ${allowed.join(' or ')}, received ${result.status}`), { response: result });
      }
      return result;
    } finally { clearTimeout(timeout); }
  }
}
