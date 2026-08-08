import { loadEnvironment } from './journeys/lib/environment.js';
import { JourneyRunner } from './journeys/lib/journey-runner.js';
import { journeys } from './journeys/current-system.journey.js';

function usage(): never { console.error('Usage: tsx scripts/run-journey.ts <list|current|auth|content|journey-id> [--verbose|--quiet] [--json] [--retain-created-data]'); process.exit(2); }

async function main(): Promise<void> {
  const [selection, ...flags] = process.argv.slice(2);
  if (!selection) usage();
  const verbose = flags.includes('--verbose') || process.env.JOURNEY_VERBOSE === 'true'; const quiet = flags.includes('--quiet'); const json = flags.includes('--json'); const retain = flags.includes('--retain-created-data');
  if (verbose && quiet) throw new Error('--verbose and --quiet cannot be combined');
  if (selection === 'list') { for (const journey of journeys) console.log(`${journey.id}\t${journey.category}\t${journey.requiresBunny ? 'bunny\t' : ''}${journey.name}`); return; }
  const environment = loadEnvironment();
  console.log(`Journey target: ${environment.baseUrl} (${environment.target})`);
  if (retain) console.log('Created data will be retained (the default; account cleanup APIs are not available).');
  const runner = new JourneyRunner(environment, journeys, { verbose, quiet });
  const selected = selection === 'current' ? journeys : selection === 'auth' ? journeys.filter((journey) => journey.category === 'auth') : selection === 'content' ? journeys.filter((journey) => journey.category === 'content') : journeys.filter((journey) => journey.id === selection);
  if (!selected.length) usage();
  const started = performance.now(); let results;
  try { results = await runner.execute(selected); }
  catch { results = await runner.execute([]); process.exitCode = 1; }
  const duration = performance.now() - started; const passed = results.filter((result) => result.status === 'passed').length; const failed = results.filter((result) => result.status === 'failed').length; const skipped = results.filter((result) => result.status === 'skipped').length;
  console.log(`Journey run: ${runner.getContext().runId}\nTarget: ${environment.baseUrl}\nPassed: ${passed}\nFailed: ${failed}\nSkipped: ${skipped}\nDuration: ${(duration / 1000).toFixed(2)} seconds`);
  if (json) console.log(`JSON report: ${await runner.writeReport(results)}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(`Journey runner failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
