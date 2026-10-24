// Dry-run by default; --apply changes only the reviewed missing-letter typo.
// Works before or after the column rename. Existing stale flags are retained.
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const questionId = 'cmvk8lrnq02wyle01x0sd14x6';
const reviewedHash =
  '056ecaf5ff92549a5369e054a6fc16aee4f42d6b42ffa5e02104adedf2057a48';
const fields = [
  'answerElements',
  'scientificExplanation',
  'commonMistakes',
  'whatIf',
];
const metadata = ['languageCode', 'origin', 'staleAt'];

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function planCorrection(state) {
  if (digest(state) !== reviewedHash) {
    // Recognize this exact correction on subsequent runs, without changing it.
    if (
      state.referenceText === null &&
      state.structured.answerElements.startsWith('لا أتفق')
    ) {
      const original = {
        ...state,
        referenceText: fields
          .map((field) => state.structured[field])
          .join('\n\n'),
        structured: {
          ...state.structured,
          answerElements: state.structured.answerElements.slice(1),
        },
      };
      if (digest(original) === reviewedHash)
        return { status: 'already_applied', questionId };
    }
    throw new Error('REVIEWED_RECORD_CHANGED');
  }
  const before = state.structured.answerElements;
  const after = `ل${before}`;
  const corrected = { ...state.structured, answerElements: after };
  if (
    fields.map((field) => corrected[field]).join('\n\n') !== state.referenceText
  )
    throw new Error('LEGACY_TEXT_DOES_NOT_CONFIRM_CORRECTION');
  return {
    status: 'proposed',
    questionId,
    before,
    after,
    clearedRedundantText: state.referenceText,
    staleAtRetained: state.structured.staleAt,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (
    process.argv.slice(2).some((arg) => !['--apply', '--dry-run'].includes(arg))
  )
    throw new Error('UNSUPPORTED_ARGUMENT');
  const prisma = new PrismaClient();
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        if (!apply) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
        const columns =
          await tx.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Question'
          AND column_name IN ('explanation', 'moreExplanation')`);
        if (columns.length !== 1) throw new Error('UNSUPPORTED_SCHEMA');
        const column = columns[0].column_name;
        // Identifiers are restricted by the literal column-name list above.
        const rows = await tx.$queryRawUnsafe(
          `SELECT q.id, q.status::text, q.type::text, q.body,
        q."${column}" AS "referenceText", to_jsonb(e) AS structured
        FROM "Question" q JOIN "QuestionExplanation" e ON e."questionId" = q.id
        WHERE q.id = $1 ${apply ? 'FOR UPDATE OF q, e' : ''}`,
          questionId,
        );
        if (rows.length !== 1) throw new Error('REVIEWED_RECORD_UNAVAILABLE');
        const row = rows[0];
        const state = {
          id: row.id,
          status: row.status,
          type: row.type,
          body: row.body,
          referenceText: row.referenceText,
          format: row.structured.structuredExplanationFormat,
          structured: Object.fromEntries(
            [...fields, ...metadata].map((field) => [
              field,
              row.structured[field] ?? null,
            ]),
          ),
        };
        const plan = planCorrection(state);
        if (apply && plan.status === 'proposed') {
          await tx.$executeRawUnsafe(
            `UPDATE "QuestionExplanation" SET "answerElements" = $1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "questionId" = $2`,
            plan.after,
            questionId,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "Question" SET "${column}" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
            questionId,
          );
        }
        return {
          mode: apply ? 'apply' : 'dry_run',
          performedBy: 'reviewed-maintenance-script',
          status: apply && plan.status === 'proposed' ? 'applied' : plan.status,
          plan,
          pendingManualReview: [
            'two published placeholder explanations',
            'three legacy-only explanations',
            'sentence-difference record',
            'published stale explanations',
          ],
        };
      },
      { timeout: 30000 },
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module || module.id === '[stdin]')
  main().catch((error) => {
    console.error('Reviewed correction stopped:', error.code ?? error.message);
    process.exitCode = 1;
  });
module.exports = { planCorrection };
