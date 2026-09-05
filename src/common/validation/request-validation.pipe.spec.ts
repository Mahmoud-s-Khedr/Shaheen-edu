import 'reflect-metadata';
import { BadRequestException, type Type } from '@nestjs/common';
import { CreateAcademicGradeDto } from '../../modules/academic-grades/dto/create-academic-grade.dto';
import { CreateCourseDto } from '../../modules/courses/dto/create-course.dto';
import {
  PartnerEarningsQueryDto,
  PartnerQuestionUsageQueryDto,
} from '../../modules/partner-analytics/dto/partner-analytics.dto';
import { ResolveReconciliationDiscrepancyDto } from '../../modules/partner-finance/dto/partner-finance.dto';
import { PerformanceAnalysisQueryDto } from '../../modules/performance/performance.dto';
import {
  ReferralReportingQueryDto,
  ResolveReferralReviewFlagDto,
} from '../../modules/referrals/dto/referrals.dto';
import {
  CreateQuestionSourceDto,
  ReorderQuestionOptionsDto,
  ReorderQuestionAssetsDto,
} from '../../modules/question-banks/dto/question-banks.dto';
import { ReplaceVideoOutlineDto } from '../../modules/content-items/dto/replace-video-outline.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import type { ValidationDetail, LocalizedMessage } from '../i18n/api-messages';
import {
  createRequestValidationPipe,
  createValidationException,
} from './request-validation.pipe';

interface ValidationResponse {
  code: string;
  message: LocalizedMessage;
  details: ValidationDetail[];
}

async function rejection(metatype: Type, value: unknown) {
  try {
    await createRequestValidationPipe().transform(value, {
      type: 'body',
      metatype,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as ValidationResponse;
  }
  throw new Error('Expected request validation to reject the payload');
}

describe('request validation', () => {
  it('makes nested array errors actionable without returning submitted values', async () => {
    const body = await rejection(ReplaceVideoOutlineDto, {
      topics: [{ title: 'Topic', concepts: [{ title: '' }] }],
      password: 'private-secret',
    });
    expect(body.code).toBe('BAD_REQUEST.VALIDATION_FAILED');
    expect(body.message).toEqual(body.details[0].message);
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'password',
          code: 'VALIDATION.WHITELISTVALIDATION',
        }),
        expect.objectContaining({
          field: 'topics.0.concepts.0.title',
          code: 'VALIDATION.MINLENGTH',
        }),
      ]),
    );
    expect(JSON.stringify(body)).not.toContain('private-secret');
    expect(
      body.details.every(
        (detail) => !('target' in detail) && !('value' in detail),
      ),
    ).toBe(true);
  });

  it('preserves query number conversion and defaults', async () => {
    const result: unknown = await createRequestValidationPipe().transform(
      { page: '2' },
      { type: 'query', metatype: PaginationQueryDto },
    );
    expect(result).toMatchObject({ page: 2, limit: 20 });
  });

  it.each([CreateAcademicGradeDto, CreateQuestionSourceDto])(
    '%p rejects an omitted required localized title',
    async (metatype) => {
      const body = await rejection(metatype, {});
      expect(body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'title',
            code: 'VALIDATION.ISDEFINED',
          }),
        ]),
      );
    },
  );

  it.each([
    [CreateCourseDto, 'accessType', 'PUBLIC, FREE, PAID'],
    [PartnerEarningsQueryDto, 'granularity', 'day, month'],
    [PartnerQuestionUsageQueryDto, 'granularity', 'day, month'],
    [ReferralReportingQueryDto, 'granularity', 'day, month'],
    [ResolveReferralReviewFlagDto, 'status', 'RESOLVED, ACCEPTED'],
    [ResolveReconciliationDiscrepancyDto, 'status', 'RESOLVED, ACCEPTED'],
    [
      PerformanceAnalysisQueryDto,
      'level',
      'subject, course, chapter, lesson, section',
    ],
  ] as [Type, string, string][])(
    '%p lists supported values for %s',
    async (metatype, field, values) => {
      const body = await rejection(metatype, { [field]: 'INVALID' });
      expect(
        body.details.find((detail) => detail.field === field)?.message.en,
      ).toContain(values);
    },
  );

  it('has a stable fallback if the validator supplies no constraints', () => {
    const body = createValidationException(
      [],
    ).getResponse() as ValidationResponse;
    expect(body.code).toBe('BAD_REQUEST.VALIDATION_FAILED');
    expect(body.message.en).toBe('Validation failed');
    expect(body.details).toEqual([]);
  });

  it.each([
    [ReorderQuestionOptionsDto, 'optionIds'],
    [ReorderQuestionAssetsDto, 'assetIds'],
  ] as [Type, string][])(
    '%p rejects a scalar reorder list',
    async (metatype, field) => {
      const body = await rejection(metatype, { [field]: 'id-1' });
      expect(body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field, code: 'VALIDATION.ISARRAY' }),
        ]),
      );
      await expect(
        createRequestValidationPipe().transform(
          { [field]: ['id-1'] },
          { type: 'body', metatype },
        ),
      ).resolves.toMatchObject({ [field]: ['id-1'] });
    },
  );
});
