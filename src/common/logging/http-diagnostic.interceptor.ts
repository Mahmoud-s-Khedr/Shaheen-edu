import {
  CallHandler,
  ExecutionContext,
  Injectable,
  HttpException,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ObservabilityService } from './observability.service';

@Injectable()
export class HttpDiagnosticInterceptor implements NestInterceptor {
  constructor(private readonly diagnostics: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const startedAt = performance.now();
    const correlationId = this.diagnostics.correlationId();
    if (correlationId) response.header('X-Correlation-ID', correlationId);

    return next.handle().pipe(
      tap({
        next: () => {
          this.record(request, startedAt, response.statusCode);
        },
        error: (error: unknown) => {
          const statusCode =
            error instanceof HttpException ? error.getStatus() : 500;
          this.record(request, startedAt, statusCode);
        },
      }),
    );
  }

  private record(
    request: FastifyRequest,
    startedAt: number,
    statusCode: number,
  ): void {
    const matched = request as FastifyRequest & {
      routeOptions?: { url?: string };
    };
    // Use Fastify's matched template, never request.url (which includes a
    // literal path and query values).
    const route = matched.routeOptions?.url ?? 'unmatched';
    this.diagnostics.emit({
      event: 'http_request_completed',
      operation: `${request.method} ${route}`,
      outcome: statusCode >= 400 ? 'failure' : 'success',
      reasonCode: statusCode >= 400 ? `HTTP_${statusCode}` : 'HTTP_OK',
      durationMs: Math.round(performance.now() - startedAt),
      counts: { statusCode },
    });
  }
}
