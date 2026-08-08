import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ApiClient } from './api-client.js';
import { DataFactory } from './data-factory.js';
import { getDeliveryFetches, resetDeliveryFetches } from './delivery.js';
import { redact } from './redaction.js';
import type {
  JourneyContext,
  JourneyDefinition,
  JourneyResult,
  JourneyRuntime,
} from './types.js';
import type { JourneyEnvironment } from './environment.js';

export class JourneyRunner {
  private readonly byId: Map<string, JourneyDefinition>;
  private readonly completed = new Map<string, JourneyResult>();
  private readonly context: JourneyContext;
  private readonly clients: Record<string, ApiClient>;
  private readonly factory: DataFactory;
  private readonly operations: import('./types.js').OperationRecord[] = [];
  private activeCorrelationIds: string[] | undefined;

  constructor(
    private readonly environment: JourneyEnvironment,
    definitions: JourneyDefinition[],
    private readonly options: { verbose: boolean; quiet: boolean },
  ) {
    resetDeliveryFetches();
    this.byId = new Map(definitions.map((journey) => [journey.id, journey]));
    this.factory = new DataFactory();
    this.context = {
      runId: this.factory.runId,
      created: {
        admins: [],
        partners: [],
        students: [],
        grades: [],
        subjects: [],
        courses: [],
        chapters: [],
        lessons: [],
        sections: [],
        contentItems: [],
        questionSources: [],
        questionBanks: [],
        questions: [],
        assessments: [],
      },
      superAdmin: {},
      admin: {},
      partner: {},
      students: [],
      parent: {},
      academic: {},
    };
    const config = environment;
    this.clients = Object.fromEntries(
      ['public', 'superAdmin', 'admin', 'partner', 'student', 'parent'].map(
        (name) => [
          name,
          new ApiClient(
            config,
            name,
            (correlationId) => this.activeCorrelationIds?.push(correlationId),
            (operation) => this.operations.push(operation),
          ),
        ],
      ),
    );
  }

  list(): JourneyDefinition[] {
    return [...this.byId.values()];
  }
  getContext(): JourneyContext {
    return this.context;
  }
  getOperations(): readonly import('./types.js').OperationRecord[] {
    return this.operations;
  }
  getDeliveryFetches(): readonly import('./delivery.js').DeliveryFetchRecord[] {
    return getDeliveryFetches();
  }
  getClient(name: string): ApiClient {
    const client = this.clients[name];
    if (!client) throw new Error(`Unknown journey client: ${name}`);
    return client;
  }

  async execute(selected: JourneyDefinition[]): Promise<JourneyResult[]> {
    for (const journey of selected) await this.executeOne(journey.id);
    return [...this.completed.values()];
  }

  private async executeOne(id: string): Promise<void> {
    if (this.completed.has(id)) return;
    const journey = this.byId.get(id);
    if (!journey) throw new Error(`Unknown journey: ${id}`);
    for (const dependency of journey.dependsOn ?? [])
      await this.executeOne(dependency);
    const skippedDependency = (journey.dependsOn ?? [])
      .map((dependency) => this.completed.get(dependency))
      .find((result) => result?.status === 'skipped');
    const skipReason = journey.requiresBunny && this.environment.target === 'local'
      ? 'Requires Bunny Storage or Stream; skipped for JOURNEY_TARGET=local'
      : skippedDependency
        ? `Dependency ${skippedDependency.id} was skipped`
        : undefined;
    if (skipReason) {
      const result: JourneyResult = {
        id: journey.id,
        name: journey.name,
        status: 'skipped',
        durationMs: 0,
        correlationIds: [],
        created: structuredClone(this.context.created),
        skippedReason: skipReason,
      };
      this.completed.set(id, result);
      if (!this.options.quiet)
        console.log(`[${journey.id}] Skipped: ${skipReason}`);
      return;
    }
    const started = performance.now();
    const correlationIds: string[] = [];
    let currentStep = '';
    this.activeCorrelationIds = correlationIds;
    if (!this.options.quiet)
      console.log(`[${journey.id}] Starting ${journey.name}`);
    const runtime: JourneyRuntime = {
      context: this.context,
      clients: this.clients,
      factory: this.factory,
      options: { verbose: this.options.verbose },
      environment: this.environment,
      step: async (label, action) => {
        currentStep = label;
        try {
          await action();
          if (!this.options.quiet)
            console.log(`[${journey.id}] ${label}... PASS`);
        } catch (error) {
          const response = (error as { response?: { correlationId?: string } })
            .response;
          if (response?.correlationId)
            correlationIds.push(response.correlationId);
          throw error;
        }
      },
    };
    try {
      await journey.run(runtime);
      const result: JourneyResult = {
        id: journey.id,
        name: journey.name,
        status: 'passed',
        durationMs: performance.now() - started,
        correlationIds,
        created: structuredClone(this.context.created),
      };
      this.completed.set(id, result);
      this.activeCorrelationIds = undefined;
      if (!this.options.quiet)
        console.log(
          `[${journey.id}] Completed in ${(result.durationMs / 1000).toFixed(2)}s`,
        );
    } catch (error) {
      const result: JourneyResult = {
        id: journey.id,
        name: journey.name,
        status: 'failed',
        durationMs: performance.now() - started,
        failedStep: currentStep,
        correlationIds,
        created: structuredClone(this.context.created),
        error: redact(
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
        ),
      };
      this.completed.set(id, result);
      this.activeCorrelationIds = undefined;
      console.error(
        `[${journey.id}] FAILED at ${currentStep}: ${JSON.stringify(result.error)}`,
      );
      throw error;
    }
  }

  async writeReport(results: JourneyResult[]): Promise<string> {
    const directory = resolve(process.cwd(), 'reports', 'journeys');
    await mkdir(directory, { recursive: true });
    const path = resolve(directory, `${this.context.runId}.json`);
    await writeFile(
      path,
      `${JSON.stringify({ runId: this.context.runId, target: this.environment.baseUrl, deliveryFetches: this.getDeliveryFetches(), results, calls: this.getOperations() }, null, 2)}\n`,
      'utf8',
    );
    return path;
  }
}
