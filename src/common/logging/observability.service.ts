import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import type { AppConfig } from '../../config/configuration';

export type DiagnosticOutcome = 'success' | 'failure' | 'denied' | 'empty';

/**
 * The deliberately small diagnostic envelope. Values in `references` must be
 * created with reference(); this prevents convenience logging from gradually
 * turning into an alternate store for personal data or request payloads.
 */
export interface DiagnosticEvent {
  event: string;
  operation: string;
  outcome: DiagnosticOutcome;
  reasonCode?: string;
  durationMs?: number;
  actorUserId?: string;
  references?: Record<string, string | undefined>;
  counts?: Record<string, number | undefined>;
  errorType?: string;
  errorFingerprint?: string;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly secret: string;
  private readonly environment: string;
  private readonly version: string;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly cls: ClsService,
  ) {
    this.secret = config.get('observability', { infer: true }).hmacSecret;
    this.environment = config.get('nodeEnv', { infer: true });
    this.version = config.get('version', { infer: true });
  }

  /** A stable, environment-secret reference that never exposes a database ID. */
  reference(
    type: string,
    rawId: string | undefined | null,
  ): string | undefined {
    if (!rawId) return undefined;
    const digest = createHmac('sha256', this.secret)
      .update(`${type}:${rawId}`)
      .digest('base64url')
      .slice(0, 24);
    return `${type}_${digest}`;
  }

  correlationId(): string | undefined {
    return this.cls.isActive() ? this.cls.getId() : undefined;
  }

  emit(input: DiagnosticEvent): void {
    const references = Object.fromEntries(
      Object.entries(input.references ?? {}).filter(
        (entry) => typeof entry[1] === 'string',
      ),
    );
    const counts = Object.fromEntries(
      Object.entries(input.counts ?? {}).filter(
        (entry) => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
    this.logger.log({
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      service: process.env.OBSERVABILITY_SERVICE ?? 'api',
      environment: this.environment,
      version: this.version,
      correlationId: this.correlationId(),
      event: input.event,
      operation: input.operation,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      durationMs: input.durationMs,
      actorRef: this.reference('user', input.actorUserId),
      references,
      counts,
      errorType: input.errorType,
      errorFingerprint: input.errorFingerprint,
    });
  }
}
