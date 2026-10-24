import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { QuestionAiExplanationClient } from '../src/modules/ai-question-explanations/question-ai-explanation.client';
import { PrismaService } from '../src/database/prisma.service';
import {
  AccessType,
  ContentStatus,
  QuestionSourceType,
  QuestionType,
} from '../src/common/types/roles.enum';
import { createTestApp } from './utils/create-test-app';
import { flushTestRedis, seedSuperAdmin } from './utils/db';

const written = {
  answerElements: 'State the required result.',
  scientificExplanation: 'Explain the supporting concept.',
  commonMistakes: 'Avoid omitting the result.',
  whatIf: 'Changing the givens changes the result.',
};
const six = {
  keywords: 'givens',
  eliminationStrategy: 'strategy',
  whyCorrect: 'reason',
  generalRule: 'rule',
  commonMistakes: 'mistakes',
  whatIf: 'variation',
};

describe('Question explanation formats (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let headers: { authorization: string };
  let base: { bankId: string; sourceId: string; courseId: string };
  beforeAll(async () => {
    app = await createTestApp();
    await flushTestRedis(app);
    prisma = app.get(PrismaService);
    const admin = await seedSuperAdmin(
      app,
      'explanation-formats@example.com',
      'SuperAdminP@ss1!',
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'explanation-formats@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    headers = { authorization: `Bearer ${JSON.parse(login.body).accessToken}` };
    const owner = {
      createdById: admin.id,
      updatedById: admin.id,
      status: ContentStatus.PUBLISHED,
    };
    const subject = await prisma.subject.create({
      data: {
        ...owner,
        title: 'Explanation subject',
        slug: 'explanation-subject',
        sortOrder: 1,
      },
    });
    const course = await prisma.course.create({
      data: {
        ...owner,
        subjectId: subject.id,
        title: 'Explanation course',
        slug: 'explanation-course',
        sortOrder: 1,
        accessType: AccessType.PUBLIC,
      },
    });
    const bank = await prisma.questionBank.create({
      data: { ...owner, subjectId: subject.id, title: 'Explanation bank' },
    });
    const source = await prisma.questionSource.create({
      data: { ...owner, titleAr: 'Source', type: QuestionSourceType.PLATFORM },
    });
    base = { bankId: bank.id, sourceId: source.id, courseId: course.id };
  });
  afterAll(async () => {
    await app?.close();
  });
  const create = (extra: object) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers,
      payload: {
        ...base,
        body: 'Explain the concept.',
        placements: [{ courseId: base.courseId }],
        type: QuestionType.LONG_ANSWER,
        gradingRubric: 'Identify the concept and explain it.',
        maxPoints: 5,
        ...extra,
      },
    });

  it('edits, preserves and clears additional notes without staling the structured content', async () => {
    const created = await create({
      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
      structuredExplanation: written,
      moreExplanation: 'Initial notes',
    });
    expect(created.statusCode).toBe(201);
    const id = JSON.parse(created.body).id;
    for (const [payload, expected] of [
      [{ moreExplanation: '  Updated notes  ' }, 'Updated notes'],
      [
        {
          structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
          structuredExplanation: written,
        },
        'Updated notes',
      ],
      [{ moreExplanation: null }, null],
    ] as const) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/questions/${id}`,
        headers,
        payload,
      });
      expect(response.statusCode).toBe(200);
      const question = JSON.parse(response.body);
      expect(question.moreExplanation).toBe(expected);
      expect(question.structuredExplanation.staleAt).toBeNull();
      expect(question).not.toHaveProperty('explanation');
    }
    const obsolete = await create({ explanation: 'Old compatibility field' });
    expect(obsolete.statusCode).toBe(400);
  });

  it('searches structured sections and administrator additional notes', async () => {
    const created = await create({
      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
      structuredExplanation: {
        ...written,
        scientificExplanation: 'DistinctSectionSearchToken',
      },
      moreExplanation: 'DistinctAdditionalSearchToken',
    });
    expect(created.statusCode).toBe(201);
    for (const q of [
      'DistinctSectionSearchToken',
      'DistinctAdditionalSearchToken',
      'Explain DistinctSectionSearchToken',
    ]) {
      const result = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/questions?q=${encodeURIComponent(q)}`,
        headers,
      });
      expect(result.statusCode).toBe(200);
      expect(
        JSON.parse(result.body).data.map((question: any) => question.id),
      ).toContain(JSON.parse(created.body).id);
    }
  });

  it('round-trips manual formats, clears inactive columns and stales changed marks', async () => {
    const response = await create({
      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
      structuredExplanation: written,
      moreExplanation: '  Additional admin reasoning  ',
    });
    expect(response.statusCode).toBe(201);
    const question = JSON.parse(response.body);
    expect(question).not.toHaveProperty('explanation');
    expect(question.moreExplanation).toBe('Additional admin reasoning');
    expect(question.structuredExplanationFormat).toBe('WRITTEN_FOUR_SECTION');
    expect(question.structuredExplanation).toMatchObject(written);
    expect(question.structuredExplanation).not.toHaveProperty(
      'structuredExplanationFormat',
    );
    expect(question.structuredExplanation).not.toHaveProperty('keywords');
    let updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/questions/${question.id}`,
      headers,
      payload: { maxPoints: 6 },
    });
    expect(updated.statusCode).toBe(200);
    expect(JSON.parse(updated.body).structuredExplanation.staleAt).toBeTruthy();
    expect(JSON.parse(updated.body).moreExplanation).toBe(
      'Additional admin reasoning',
    );
    updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/questions/${question.id}`,
      headers,
      payload: { structuredExplanation: six },
    });
    expect(updated.statusCode).toBe(200);
    expect(JSON.parse(updated.body).structuredExplanationFormat).toBe(
      'SIX_SECTION',
    );
    expect(
      (
        await prisma.questionExplanation.findUniqueOrThrow({
          where: { questionId: question.id },
        })
      ).answerElements,
    ).toBeNull();
    updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/questions/${question.id}`,
      headers,
      payload: {
        maxPoints: 7,
        structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
        structuredExplanation: written,
      },
    });
    expect(updated.statusCode).toBe(200);
    const record = await prisma.questionExplanation.findUniqueOrThrow({
      where: { questionId: question.id },
    });
    expect(record.keywords).toBeNull();
    expect(record.staleAt).toBeNull();
  });
  it.each([
    { structuredExplanation: written },
    {
      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
      structuredExplanation: { ...written, keywords: 'mixed' },
    },
    {
      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
      structuredExplanation: written,
      type: 'SINGLE_CHOICE',
    },
    {
      structuredExplanationFormat: 'SIX_SECTION',
      structuredExplanation: written,
    },
  ])('rejects invalid manual formats %j', async (extra) => {
    expect((await create(extra)).statusCode).toBe(400);
  });
  it('returns both fields as null without an explanation', async () => {
    const response = await create({});
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      structuredExplanation: null,
      structuredExplanationFormat: null,
    });
  });
  it('reviews proposed marks through the API without changing saved marks until approval', async () => {
    const created = await create({
      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
      structuredExplanation: written,
    });
    expect(created.statusCode).toBe(201);
    const question = JSON.parse(created.body);
    const url = `/api/v1/admin/questions/${question.id}/ai/re-answer`;
    const client = app.get(QuestionAiExplanationClient);
    const generate = jest.spyOn(client, 'generate').mockResolvedValue({
      result: {
        structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
        structuredExplanation: written,
        confidence: 1,
        warnings: [],
      },
      model: 'test',
      raw: {},
      usage: {},
    } as any);
    try {
      for (const maxPoints of [null, 0, -1, 1.5]) {
        const invalid = await app.inject({
          method: 'POST',
          url,
          headers,
          payload: {
            maxPoints,
            suppliedAnswer: { gradingRubric: question.gradingRubric },
          },
        });
        expect(invalid.statusCode).toBe(400);
      }
      expect(generate).not.toHaveBeenCalled();
      const response = await app.inject({
        method: 'POST',
        url,
        headers,
        payload: {
          maxPoints: 8,
          suppliedAnswer: { gradingRubric: question.gradingRubric },
        },
      });
      expect(response.statusCode).toBe(201);
      const run = JSON.parse(response.body);
      expect(run.proposedMaxPoints).toBe(8);
      expect(run.questionSnapshot.maxPoints).toBe(5);
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxPoints: 8,
          question: expect.objectContaining({ maxPoints: 8 }),
        }),
      );
      expect(
        (
          await prisma.question.findUniqueOrThrow({
            where: { id: question.id },
          })
        ).maxPoints,
      ).toBe(5);
      const listed = await app.inject({ method: 'GET', url, headers });
      expect(JSON.parse(listed.body)[0].proposedMaxPoints).toBe(8);
      const fetched = await app.inject({
        method: 'GET',
        url: `${url}/${run.id}`,
        headers,
      });
      expect(JSON.parse(fetched.body).proposedMaxPoints).toBe(8);
      const explanationOnly = await app.inject({
        method: 'POST',
        url: `${url}/${run.id}/apply`,
        headers,
        payload: { applyAnswer: false, applyExplanation: true },
      });
      expect(explanationOnly.statusCode).toBe(409);
      const approved = await app.inject({
        method: 'POST',
        url: `${url}/${run.id}/apply`,
        headers,
        payload: { applyAnswer: true, applyExplanation: true },
      });
      expect(approved.statusCode).toBe(201);
      expect(JSON.parse(approved.body).maxPoints).toBe(8);
      expect(
        (
          await prisma.question.findUniqueOrThrow({
            where: { id: question.id },
          })
        ).maxPoints,
      ).toBe(8);
      const another = await app.inject({
        method: 'POST',
        url,
        headers,
        payload: {
          maxPoints: 9,
          suppliedAnswer: { gradingRubric: question.gradingRubric },
        },
      });
      const rejected = await app.inject({
        method: 'POST',
        url: `${url}/${JSON.parse(another.body).id}/reject`,
        headers,
        payload: { note: 'Keep eight marks.' },
      });
      expect(rejected.statusCode).toBe(201);
      expect(JSON.parse(rejected.body).proposedMaxPoints).toBe(9);
      expect(
        (
          await prisma.question.findUniqueOrThrow({
            where: { id: question.id },
          })
        ).maxPoints,
      ).toBe(8);
    } finally {
      generate.mockRestore();
    }
  });

  it('migrates distinct legacy text and removes generated duplicates without changing sections', async () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20261024120000_structured_and_more_explanations/migration.sql',
      ),
      'utf8',
    );
    const helper = migration.match(/CREATE FUNCTION[\s\S]*?\$\$;/)![0];
    const statements = migration
      .replace(/^BEGIN;|^COMMIT;/gm, '')
      .replace(helper, '')
      .split(';')
      .filter((value) => value.trim());
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE SCHEMA additional_explanation_migration_test',
      );
      await tx.$executeRawUnsafe(
        'SET LOCAL search_path TO additional_explanation_migration_test',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Question" (id TEXT PRIMARY KEY, explanation TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "QuestionExplanation" ("questionId" TEXT, "structuredExplanationFormat" TEXT, keywords TEXT, "eliminationStrategy" TEXT, "whyCorrect" TEXT, "generalRule" TEXT, "whatIf" TEXT, "commonMistakes" TEXT, "answerElements" TEXT, "scientificExplanation" TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "AssessmentQuestion" (id TEXT PRIMARY KEY, explanation TEXT, "structuredExplanation" JSONB, "structuredExplanationFormat" TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "QuestionReport" ("questionSnapshot" JSONB)',
      );
      const examples = [
        {
          id: 'plain-only',
          sections: null,
          flat: 'Legacy human explanation',
          expected: 'Legacy human explanation',
        },
        {
          id: 'distinct',
          sections: six,
          flat: 'Additional teaching note',
          expected: 'Additional teaching note',
        },
        {
          id: 'generated',
          sections: six,
          flat: [
            'givens',
            'strategy',
            'reason',
            'rule',
            'variation',
            'mistakes',
          ].join('\n\n'),
          expected: null,
        },
        {
          id: 'labeled',
          sections: six,
          flat: 'Keywords: givens\n\nSolution strategy: strategy\n\nWhy this is correct: reason\n\nGeneral rule: rule\n\nWhat if?: variation\n\nCommon mistakes: mistakes',
          expected: null,
        },
        {
          id: 'written',
          sections: written,
          flat: Object.values(written).join('\n\n'),
          expected: null,
        },
        {
          id: 'formatting-only',
          sections: six,
          flat: 'givens \nstrategy\t reason\r\n rule  variation\n mistakes',
          expected: null,
        },
        {
          id: 'changed-sentence',
          sections: six,
          flat: 'givens\n\nstrategy\n\nreason\n\nrule\n\nvariation\n\nmistakes. Additional administrator sentence.',
          expected:
            'givens\n\nstrategy\n\nreason\n\nrule\n\nvariation\n\nmistakes. Additional administrator sentence.',
        },
        { id: 'empty', sections: null, flat: '   ', expected: null },
      ];
      for (const item of examples) {
        const format =
          item.id === 'written' ? 'WRITTEN_FOUR_SECTION' : 'SIX_SECTION';
        await tx.$executeRawUnsafe(
          'INSERT INTO "Question" VALUES ($1, $2)',
          item.id,
          item.flat,
        );
        if (item.sections) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "QuestionExplanation"
            SELECT $1, $2, x.keywords, x."eliminationStrategy", x."whyCorrect", x."generalRule", x."whatIf", x."commonMistakes", x."answerElements", x."scientificExplanation"
            FROM jsonb_to_record($3::jsonb) AS x(keywords TEXT, "eliminationStrategy" TEXT, "whyCorrect" TEXT, "generalRule" TEXT, "whatIf" TEXT, "commonMistakes" TEXT, "answerElements" TEXT, "scientificExplanation" TEXT)`,
            item.id,
            format,
            JSON.stringify(item.sections),
          );
        }
        await tx.$executeRawUnsafe(
          'INSERT INTO "AssessmentQuestion" VALUES ($1, $2, $3::jsonb, $4)',
          item.id,
          item.flat,
          JSON.stringify(item.sections),
          format,
        );
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "QuestionReport" VALUES ('{"explanation":"Historical report text","body":"Question"}')`,
      );
      // Execute the helper as one statement because its body contains semicolons.
      await tx.$executeRawUnsafe(helper);
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      for (const table of ['Question', 'AssessmentQuestion']) {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "${table}" ORDER BY id`,
        );
        for (const item of examples) {
          const row = rows.find((value) => value.id === item.id);
          expect(row.moreExplanation).toBe(item.expected);
          expect(row).not.toHaveProperty('explanation');
          if (table === 'AssessmentQuestion')
            expect(row.structuredExplanation).toEqual(item.sections);
        }
      }
      const reports = await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM "QuestionReport"',
      );
      expect(reports[0].questionSnapshot).toEqual({
        body: 'Question',
        moreExplanation: 'Historical report text',
      });
      await tx.$executeRawUnsafe(
        'DROP SCHEMA additional_explanation_migration_test CASCADE',
      );
    });
  });

  it('preserves old explanations, pending runs and immutable snapshots during migration', async () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20261010120000_written_explanation_formats/migration.sql',
      ),
      'utf8',
    );
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE SCHEMA explanation_migration_test');
      await tx.$executeRawUnsafe(
        'SET LOCAL search_path TO explanation_migration_test',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "QuestionExplanation" ("keywords" TEXT NOT NULL, "eliminationStrategy" TEXT NOT NULL, "whyCorrect" TEXT NOT NULL, "generalRule" TEXT NOT NULL)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "QuestionAiExplanationRun" ("structuredExplanation" JSONB, "status" TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "AssessmentQuestion" ("structuredExplanation" JSONB)',
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "QuestionExplanation" VALUES ('k', 's', 'r', 'g')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "QuestionAiExplanationRun" VALUES ('{"keywords":"historical"}', 'PENDING_REVIEW')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "AssessmentQuestion" VALUES ('{"keywords":"immutable"}')`,
      );
      for (const statement of migration
        .split(';')
        .filter((value) => value.trim()))
        await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(
        readFileSync(
          resolve(
            __dirname,
            '../prisma/migrations/20261010130000_ai_explanation_proposed_max_points/migration.sql',
          ),
          'utf8',
        ),
      );
      const explanations = await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM "QuestionExplanation"',
      );
      expect(explanations[0]).toMatchObject({
        keywords: 'k',
        whyCorrect: 'r',
        structuredExplanationFormat: 'SIX_SECTION',
        answerElements: null,
      });
      const runs = await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM "QuestionAiExplanationRun"',
      );
      expect(runs[0]).toEqual({
        structuredExplanation: { keywords: 'historical' },
        status: 'PENDING_REVIEW',
        proposedMaxPoints: null,
        structuredExplanationFormat: 'SIX_SECTION',
      });
      const snapshots = await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM "AssessmentQuestion"',
      );
      expect(snapshots[0]).toEqual({
        structuredExplanation: { keywords: 'immutable' },
        structuredExplanationFormat: 'SIX_SECTION',
      });
      await tx.$executeRawUnsafe(
        'DROP SCHEMA explanation_migration_test CASCADE',
      );
    });
  });
});
