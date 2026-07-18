import { assert, expectStatus, expectString } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const healthJourney: JourneyDefinition = {
  id: 'INFRA-001', name: 'Health and API discovery', category: 'infrastructure',
  async run({ clients, step }) {
    await step('Checking health endpoint', async () => {
      const response = await clients.public.request<Record<string, unknown>>('GET', '/health', undefined, { rawPath: true });
      expectStatus(response, 200); assert(response.body.status === 'ok', 'Health status must be ok'); expectString(response.body.timestamp, 'health.timestamp');
    });
    await step('Checking Swagger OpenAPI document', async () => {
      const response = await clients.public.request<Record<string, unknown>>('GET', '/api/docs-json', undefined, { rawPath: true });
      expectStatus(response, 200); assert(typeof response.body.paths === 'object', 'OpenAPI paths must be present');
    });
  },
};
