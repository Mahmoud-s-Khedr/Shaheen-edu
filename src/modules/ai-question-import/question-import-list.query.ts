import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { sqlAnd } from '../../common/search/arabic-search';
import type { ListQuestionImportsDto } from './dto/list-question-imports.dto';

/** One predicate shared by the ID page and count; all values stay parameterized. */
export function questionImportListPredicate(
  query: ListQuestionImportsDto,
): Prisma.Sql {
  if (query.status !== undefined && query.statuses !== undefined)
    throw new BadRequestException('Use either status or statuses, not both');
  if (
    query.createdFrom &&
    query.createdTo &&
    new Date(query.createdFrom) >= new Date(query.createdTo)
  )
    throw new BadRequestException('createdFrom must be before createdTo');

  const placement = sqlAnd(
    query.chapterId
      ? Prisma.sql`(p->>'chapterId' = ${query.chapterId} OR pl."chapterId" = ${query.chapterId} OR sl."chapterId" = ${query.chapterId})`
      : undefined,
    query.lessonId
      ? Prisma.sql`(p->>'lessonId' = ${query.lessonId} OR ps."lessonId" = ${query.lessonId})`
      : undefined,
    query.sectionId
      ? Prisma.sql`p->>'sectionId' = ${query.sectionId}`
      : undefined,
  );
  const errors = Prisma.sql`(b.status IN ('FAILED', 'COMPLETED_WITH_ERRORS') OR b."failedItems" > 0 OR b."invalidItems" > 0)`;
  const statuses = query.status ? [query.status] : query.statuses;
  return sqlAnd(
    Prisma.sql`b."parentId" IS NULL`,
    query.courseId ? Prisma.sql`b."courseId" = ${query.courseId}` : undefined,
    query.bankId ? Prisma.sql`b."bankId" = ${query.bankId}` : undefined,
    query.sourceId ? Prisma.sql`b."sourceId" = ${query.sourceId}` : undefined,
    query.createdById
      ? Prisma.sql`b."createdById" = ${query.createdById}`
      : undefined,
    query.inputType
      ? Prisma.sql`b."inputType" = ${query.inputType}::"QuestionImportInputType"`
      : undefined,
    statuses
      ? Prisma.sql`b.status IN (${Prisma.join(statuses.map((status) => Prisma.sql`${status}::"QuestionImportStatus"`))})`
      : undefined,
    query.createdFrom
      ? Prisma.sql`b."createdAt" >= ${new Date(query.createdFrom)}`
      : undefined,
    query.createdTo
      ? Prisma.sql`b."createdAt" < ${new Date(query.createdTo)}`
      : undefined,
    query.hasErrors === undefined
      ? undefined
      : query.hasErrors
        ? errors
        : Prisma.sql`NOT ${errors}`,
    query.q
      ? Prisma.sql`(
      strpos(lower(b.id), lower(${query.q})) > 0
      OR strpos(lower(b."rawText"), lower(${query.q})) > 0
      OR strpos(lower(b."normalizedText"), lower(${query.q})) > 0
      OR EXISTS (SELECT 1 FROM "Asset" a WHERE a.id = b."sourceAssetId" AND strpos(lower(a.filename), lower(${query.q})) > 0)
    )`
      : undefined,
    placement
      ? Prisma.sql`EXISTS (
      SELECT 1 FROM jsonb_array_elements(b.placements) p
      LEFT JOIN "Lesson" pl ON pl.id = p->>'lessonId'
      LEFT JOIN "Section" ps ON ps.id = p->>'sectionId'
      LEFT JOIN "Lesson" sl ON sl.id = ps."lessonId"
      WHERE ${placement}
    )`
      : undefined,
  )!;
}
