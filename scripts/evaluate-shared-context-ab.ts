import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type Range = { firstBlock: string; lastBlock: string };
type Context = Range & { id?: string; type?: string; consumers?: string[] };
type Question = Range & {
  id: string;
  contextIds?: string[];
  section?: string | null;
};
type Run = {
  variant: 'A' | 'B' | 'C';
  segmentation: { questions: Question[]; contexts: Context[] };
  normalized?: {
    questions: Question[];
    contexts: Context[];
    unresolvedQuestionIds?: string[];
  };
  extraction?: {
    contextAssignments?: Array<{ contextKey: string; correct: boolean }>;
  };
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    imageTokens?: number;
    cost?: number;
  };
  latencyMs?: number;
  request?: unknown;
};
type Corpus = {
  name: string;
  questionCount: number;
  gold: { questions: Question[]; contexts: Context[]; headingRanges?: Range[] };
};

const corpusPath = resolve(
  process.argv[2] ??
    'test-files/shared-context-benchmark/biology-30-page.corpus.json',
);
const runsPath = resolve(
  process.argv[3] ?? 'test-files/shared-context-benchmark/runs.json',
);
const outputPath = resolve(
  process.argv[4] ?? 'reports/ai-question-import/shared-context-ab.json',
);

function blockNumber(value: string) {
  const match = /^B(\d+)$/.exec(value);
  if (!match) throw new Error(`Invalid block key ${value}`);
  return Number(match[1]);
}
function sameRange(a: Range, b: Range) {
  return a.firstBlock === b.firstBlock && a.lastBlock === b.lastBlock;
}
function intersects(a: Range, b: Range) {
  return (
    blockNumber(a.firstBlock) <= blockNumber(b.lastBlock) &&
    blockNumber(b.firstBlock) <= blockNumber(a.lastBlock)
  );
}
function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
}
function ratio(hit: number, total: number) {
  return total ? Number((hit / total).toFixed(4)) : null;
}

function evaluateRun(corpus: Corpus, run: Run) {
  const result: {
    questions: Question[];
    contexts: Context[];
    unresolvedQuestionIds?: string[];
  } = run.normalized ?? run.segmentation;
  const questions = result.questions ?? [];
  const contexts = result.contexts ?? [];
  const goldQuestions = corpus.gold.questions;
  const goldContexts = corpus.gold.contexts;
  const exactQuestions = questions.filter((question) =>
    goldQuestions.some((gold) => sameRange(question, gold)),
  ).length;
  const matchedContexts = contexts.filter((context) =>
    goldContexts.some((gold) => sameRange(context, gold)),
  );
  const falseContexts = contexts.filter(
    (context) => !goldContexts.some((gold) => sameRange(context, gold)),
  );
  const headingErrors = falseContexts.filter((context) =>
    (corpus.gold.headingRanges ?? []).some((heading) =>
      sameRange(context, heading),
    ),
  ).length;
  const contextLinks = new Map(
    questions.map((question) => [
      question.id,
      new Set(question.contextIds ?? []),
    ]),
  );
  const contextByRange = new Map(
    contexts.map((context) => [
      `${context.firstBlock}:${context.lastBlock}`,
      context,
    ]),
  );
  let consumerTruePositive = 0;
  let consumerPredicted = 0;
  let consumerGold = 0;
  for (const gold of goldContexts) {
    const actual = contextByRange.get(`${gold.firstBlock}:${gold.lastBlock}`);
    const expectedConsumers = new Set(gold.consumers ?? []);
    const predictedConsumers = new Set(
      actual?.consumers ??
        questions
          .filter(
            (question) =>
              actual?.id && contextLinks.get(question.id)?.has(actual.id),
          )
          .map((question) => question.id),
    );
    consumerGold += expectedConsumers.size;
    consumerPredicted += predictedConsumers.size;
    for (const id of predictedConsumers)
      if (expectedConsumers.has(id)) consumerTruePositive += 1;
  }
  const overlapViolations = contexts.reduce(
    (count, context, index) =>
      count +
      Number(questions.some((question) => intersects(context, question))) +
      contexts.slice(index + 1).filter((other) => intersects(context, other))
        .length,
    0,
  );
  const contextAssignments = run.extraction?.contextAssignments ?? [];
  return {
    questionRecall: ratio(exactQuestions, goldQuestions.length),
    questionRangeAccuracy: ratio(exactQuestions, questions.length),
    genuineContextRecall: ratio(matchedContexts.length, goldContexts.length),
    falsePositiveContexts: falseContexts.length,
    headingAsContextErrors: headingErrors,
    consumerPrecision: ratio(consumerTruePositive, consumerPredicted),
    consumerRecall: ratio(consumerTruePositive, consumerGold),
    overlapViolations,
    unresolvedReviewRate: ratio(
      (result.unresolvedQuestionIds ?? []).length,
      corpus.questionCount,
    ),
    contextVisualOwnershipAccuracy: ratio(
      contextAssignments.filter((assignment) => assignment.correct).length,
      contextAssignments.length,
    ),
    totalTokens:
      Number(run.usage?.promptTokens ?? 0) +
      Number(run.usage?.completionTokens ?? 0),
    imageTokens: Number(run.usage?.imageTokens ?? 0),
    cost: Number(run.usage?.cost ?? 0),
    latencyMs: Number(run.latencyMs ?? 0),
  };
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function summarize(runs: Run[], corpus: Corpus) {
  const evaluated = runs.map((run) => evaluateRun(corpus, run));
  const number = (key: keyof (typeof evaluated)[number]) =>
    mean(evaluated.map((item) => Number(item[key] ?? 0)));
  return {
    runs: evaluated.length,
    questionRecall: number('questionRecall'),
    questionRangeAccuracy: number('questionRangeAccuracy'),
    genuineContextRecall: number('genuineContextRecall'),
    falsePositiveContexts: number('falsePositiveContexts'),
    headingAsContextErrors: number('headingAsContextErrors'),
    consumerPrecision: number('consumerPrecision'),
    consumerRecall: number('consumerRecall'),
    overlapViolations: number('overlapViolations'),
    unresolvedReviewRate: number('unresolvedReviewRate'),
    contextVisualOwnershipAccuracy: number('contextVisualOwnershipAccuracy'),
    totalTokens: number('totalTokens'),
    imageTokens: number('imageTokens'),
    cost: number('cost'),
    latencyP95Ms: percentile(
      evaluated.map((item) => item.latencyMs),
      0.95,
    ),
  };
}

async function main() {
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as Corpus;
  const runs = JSON.parse(await readFile(runsPath, 'utf8')) as Run[];
  const variants = Object.fromEntries(
    (['A', 'B', 'C'] as const).map((variant) => [
      variant,
      summarize(
        runs.filter((run) => run.variant === variant),
        corpus,
      ),
    ]),
  ) as Record<'A' | 'B' | 'C', ReturnType<typeof summarize>>;
  if (Object.values(variants).some((variant) => variant.runs < 3))
    throw new Error(
      'Each A/B/C variant requires at least three recorded runs.',
    );
  const b = variants.B;
  const c = variants.C;
  const cLostQuestions = Math.round(
    corpus.questionCount * (1 - c.questionRecall),
  );
  const promoted =
    cLostQuestions <= 1 &&
    c.falsePositiveContexts <= b.falsePositiveContexts &&
    c.overlapViolations <= b.overlapViolations &&
    Math.round(
      corpus.gold.contexts.length *
        (c.genuineContextRecall - b.genuineContextRecall),
    ) >= 2 &&
    c.genuineContextRecall - b.genuineContextRecall >= 0.2 &&
    c.cost <= b.cost * 1.15 &&
    (c.latencyP95Ms ?? Infinity) <= (b.latencyP95Ms ?? 0) * 2;
  const report = {
    corpus: { name: corpus.name, questionCount: corpus.questionCount },
    variants,
    promotion: {
      cEnabled: false,
      promoted,
      reason: promoted
        ? 'C meets the measured promotion gate; rollout still requires an explicit production decision.'
        : 'Keep B in production; C remains benchmark-only.',
      cLostQuestions,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
