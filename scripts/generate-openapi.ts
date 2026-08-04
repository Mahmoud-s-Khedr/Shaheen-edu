import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../src/app.factory';

/** Refresh the checked-in OpenAPI reference from the production app factory. */
async function main(): Promise<void> {
  const app = await createApp({ enableSwagger: true, enableLogging: false });
  try {
    // SwaggerModule creates the document and registers its Fastify routes in
    // createApp. Do not initialize application modules here: that would make
    // documentation generation depend on a running database or Redis server.
    await app.getHttpAdapter().getInstance().ready();
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });
    if (response.statusCode !== 200) {
      throw new Error(`OpenAPI generation failed with HTTP ${response.statusCode}`);
    }
    await writeFile(
      resolve(process.cwd(), 'docs-json.json'),
      `${JSON.stringify(JSON.parse(response.body), null, 2)}\n`,
    );
    console.log('Wrote docs-json.json from the runtime OpenAPI document.');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
