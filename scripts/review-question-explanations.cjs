// Run with the API container's installed Prisma client and DATABASE_URL:
// docker exec -i shaheen-edu-production-api-1 node < scripts/review-question-explanations.cjs
// SELECT-only audit; works before and after the explanation column migration.
const { PrismaClient } = require('@prisma/client');

const formats = {
  SIX_SECTION: [
    ['keywords', 'Keywords', 'الكلمات المفتاحية'],
    ['eliminationStrategy', 'Solution strategy', 'استراتيجية الحل'],
    ['whyCorrect', 'Why this is correct', 'لماذا هذه الإجابة صحيحة'],
    ['generalRule', 'General rule', 'القاعدة العامة'],
    ['whatIf', 'What if?', 'ماذا لو؟'],
    ['commonMistakes', 'Common mistakes', 'الأخطاء الشائعة'],
  ],
  WRITTEN_FOUR_SECTION: [
    ['answerElements', 'Answer elements', 'عناصر الإجابة'],
    ['scientificExplanation', 'Scientific explanation', 'التفسير العلمي'],
    ['commonMistakes', 'Common mistakes', 'الأخطاء الشائعة'],
    ['whatIf', 'What if?', 'ماذا لو؟'],
  ],
};
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const migrationText = (value) =>
  typeof value === 'string'
    ? value.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '')
    : '';

function classify(row) {
  const sections = row.structured;
  const format =
    row.format ?? sections?.structuredExplanationFormat ?? 'SIX_SECTION';
  const fields = formats[format];
  const missing = fields
    ? fields
        .filter(([field]) => !text(sections?.[field]))
        .map(([field]) => field)
    : [];
  const active = (fields ?? []).filter(([field]) =>
    migrationText(sections?.[field]),
  );
  const flat = active
    .map(([field]) => migrationText(sections[field]))
    .join('\n\n');
  const en = active
    .map(([field, label]) => `${label}: ${migrationText(sections[field])}`)
    .join('\n\n');
  const ar = active
    .map(([field, , label]) => `${label}: ${migrationText(sections[field])}`)
    .join('\n\n');
  const normalizeSpacing = (value) => value.replace(/[ \t\n\r]+/g, ' ');
  const generated = new Set(
    [
      flat,
      en,
      ar,
      `${flat}\n\n${en}`,
      `${flat}\n\n${ar}`,
      `${en}\n\n${en}`,
      `${ar}\n\n${ar}`,
    ].map(normalizeSpacing),
  );
  const legacy = migrationText(row.legacy);
  return {
    format,
    structuredState: !sections
      ? 'absent'
      : !fields
        ? 'unsupported_format'
        : missing.length
          ? 'incomplete'
          : 'complete',
    missing,
    stale: Boolean(sections?.staleAt),
    legacyOutcome: !legacy
      ? 'empty'
      : flat && generated.has(normalizeSpacing(legacy))
        ? 'generated_duplicate_to_clear'
        : 'distinct_text_to_preserve',
    legacyOnly: Boolean(legacy && !active.length),
    additionalText: Boolean(text(row.additional)),
    formatMismatch:
      format === 'WRITTEN_FOUR_SECTION' &&
      !['SHORT_ANSWER', 'FILL_IN_THE_BLANK', 'LONG_ANSWER'].includes(row.type),
  };
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

async function auditTable(tx, table, columns, details = false) {
  const column = (name) => (columns.has(name) ? `q."${name}"` : 'NULL');
  const report = {
    total: 0,
    byStatus: {},
    byFormat: {},
    structuredByStatus: {},
    legacyOnlyByStatus: {},
    legacyMigrationByStatus: {},
    staleByStatus: {},
    structured: {},
    legacyMigration: {},
    legacyOnly: 0,
    withAdditionalText: 0,
    stale: 0,
    incompatibleWrittenFormat: 0,
    samples: {},
    ...(details && table === 'Question' ? { reviewCandidates: [] } : {}),
  };
  let cursor = '';
  while (true) {
    // Table/column identifiers come exclusively from fixed names in this file.
    const rows = await tx.$queryRawUnsafe(
      `
      SELECT q.id, q.type::text AS type,
        ${details && table === 'Question' ? 'q.body' : 'NULL'} AS body,
        ${column('status')}::text AS status,
        ${column('explanation')} AS legacy,
        ${column('moreExplanation')} AS additional,
        ${table === 'Question' ? 'to_jsonb(e)' : column('structuredExplanation')} AS structured,
        ${table === 'Question' ? 'NULL' : column('structuredExplanationFormat')}::text AS format
      FROM "${table}" q
      ${table === 'Question' ? 'LEFT JOIN "QuestionExplanation" e ON e."questionId" = q.id' : ''}
      WHERE q.id > $1 ORDER BY q.id LIMIT 250
    `,
      cursor,
    );
    if (!rows.length) break;
    for (const row of rows) {
      const value = classify(row);
      report.total++;
      increment(report.byStatus, row.status ?? 'SNAPSHOT');
      increment(report.byFormat, value.format);
      increment(report.structured, value.structuredState);
      increment(
        (report.structuredByStatus[row.status ?? 'SNAPSHOT'] ??= {}),
        value.structuredState,
      );
      if (value.legacyOnly)
        increment(report.legacyOnlyByStatus, row.status ?? 'SNAPSHOT');
      increment(report.legacyMigration, value.legacyOutcome);
      increment(
        (report.legacyMigrationByStatus[row.status ?? 'SNAPSHOT'] ??= {}),
        value.legacyOutcome,
      );
      if (value.stale)
        increment(report.staleByStatus, row.status ?? 'SNAPSHOT');
      report.legacyOnly += Number(value.legacyOnly);
      report.withAdditionalText += Number(value.additionalText);
      report.stale += Number(value.stale);
      report.incompatibleWrittenFormat += Number(value.formatMismatch);
      const reasons = [
        value.structuredState !== 'complete' && value.structuredState,
        value.legacyOutcome === 'distinct_text_to_preserve' &&
          value.legacyOutcome,
        value.legacyOnly && 'legacy_only',
        value.stale && 'stale',
        value.formatMismatch && 'incompatible_written_format',
      ].filter(Boolean);
      if (
        report.reviewCandidates &&
        (value.legacyOutcome === 'distinct_text_to_preserve' ||
          (row.status !== 'ARCHIVED' && reasons.length))
      ) {
        report.reviewCandidates.push({
          id: row.id,
          status: row.status,
          type: row.type,
          body: row.body,
          reasons,
          structuredExplanationFormat: value.format,
          legacyExplanation: row.legacy,
          moreExplanation: row.additional,
          structuredExplanation: row.structured
            ? Object.fromEntries(
                [
                  ...(formats[value.format] ?? []).map(([field]) => field),
                  'languageCode',
                  'origin',
                  'staleAt',
                ].map((field) => [field, row.structured[field] ?? null]),
              )
            : null,
        });
      }
      for (const reason of reasons) {
        const samples = (report.samples[reason] ??= []);
        if (samples.length < 5)
          samples.push({
            id: row.id,
            status: row.status,
            type: row.type,
            missing: value.missing,
          });
      }
    }
    cursor = rows.at(-1).id;
  }
  return report;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
        const columns = await tx.$queryRawUnsafe(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('Question', 'AssessmentQuestion')
      `);
        const result = {
          reviewedAt: new Date().toISOString(),
          readOnly: true,
          schema: {},
          tables: {},
        };
        for (const table of ['Question', 'AssessmentQuestion']) {
          const names = new Set(
            columns
              .filter((row) => row.table_name === table)
              .map((row) => row.column_name),
          );
          if (!names.has('id')) throw new Error('UNSUPPORTED_SCHEMA');
          result.schema[table] = {
            legacyColumn: names.has('explanation'),
            additionalColumn: names.has('moreExplanation'),
          };
          result.tables[table] = await auditTable(
            tx,
            table,
            names,
            process.argv.includes('--details'),
          );
        }
        return result;
      },
      { isolationLevel: 'RepeatableRead', timeout: 120000, maxWait: 5000 },
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module || module.id === '[stdin]') {
  main().catch((error) => {
    // Do not print connection strings or raw Prisma error payloads.
    console.error(
      'Read-only explanation review failed:',
      error.code ?? 'QUERY_FAILED',
    );
    process.exitCode = 1;
  });
}
module.exports = { classify };
