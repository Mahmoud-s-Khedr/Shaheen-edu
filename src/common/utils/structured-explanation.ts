import { BadRequestException } from '@nestjs/common';
import { QuestionExplanationFormat } from '@prisma/client';

export { QuestionExplanationFormat };
export const sixSectionFields = [
  'keywords',
  'eliminationStrategy',
  'whyCorrect',
  'generalRule',
  'whatIf',
  'commonMistakes',
] as const;
export const writtenSectionFields = [
  'answerElements',
  'scientificExplanation',
  'commonMistakes',
  'whatIf',
] as const;
export const allExplanationFields = [
  ...new Set([...sixSectionFields, ...writtenSectionFields]),
];
export function explanationFields(
  format: QuestionExplanationFormat = QuestionExplanationFormat.SIX_SECTION,
) {
  return format === QuestionExplanationFormat.WRITTEN_FOUR_SECTION
    ? writtenSectionFields
    : sixSectionFields;
}
export function isWrittenQuestion(type: string) {
  return ['SHORT_ANSWER', 'FILL_IN_THE_BLANK', 'LONG_ANSWER'].includes(type);
}
export function formatForQuestion(type: string) {
  return isWrittenQuestion(type)
    ? QuestionExplanationFormat.WRITTEN_FOUR_SECTION
    : QuestionExplanationFormat.SIX_SECTION;
}
export function validateStructuredExplanation(
  value: any,
  format: QuestionExplanationFormat = QuestionExplanationFormat.SIX_SECTION,
) {
  const fields = explanationFields(format);
  if (
    !Object.values(QuestionExplanationFormat).includes(format) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => value[key] !== undefined && !fields.includes(key as never),
    ) ||
    !fields.every(
      (key) =>
        typeof value[key] === 'string' &&
        value[key].trim() &&
        value[key].length <= 10000,
    )
  ) {
    throw new BadRequestException(
      'Structured explanation must contain exactly the complete sections for its format (nonblank, at most 10000 characters)',
    );
  }
  return Object.fromEntries(
    fields.map((key) => [key, value[key].trim()]),
  ) as Record<string, string>;
}
export function explanationPersistence(
  value: any,
  format: QuestionExplanationFormat = QuestionExplanationFormat.SIX_SECTION,
) {
  return {
    ...Object.fromEntries(allExplanationFields.map((key) => [key, null])),
    ...validateStructuredExplanation(value, format),
    structuredExplanationFormat: format,
  };
}
/** Keep historical content/metadata, but never leak inactive columns or nest the format. */
export function explanationEnvelope(
  value: any,
  suppliedFormat?: QuestionExplanationFormat | null,
) {
  if (!value)
    return { structuredExplanationFormat: null, structuredExplanation: null };
  const format =
    suppliedFormat ??
    value.structuredExplanationFormat ??
    QuestionExplanationFormat.SIX_SECTION;
  const output = { ...value };
  delete output.structuredExplanationFormat;
  for (const field of allExplanationFields)
    if (!explanationFields(format).includes(field as never))
      delete output[field];
  return { structuredExplanationFormat: format, structuredExplanation: output };
}

export const explanationObjectSchemas = [
  QuestionExplanationFormat.SIX_SECTION,
  QuestionExplanationFormat.WRITTEN_FOUR_SECTION,
].map((format) => ({
  type: 'object' as const,
  additionalProperties: false,
  required: [...explanationFields(format)],
  properties: Object.fromEntries(
    explanationFields(format).map((field) => [
      field,
      { type: 'string' as const, minLength: 1, maxLength: 10000 },
    ]),
  ),
}));

export const explanationResponseSchema = {
  type: 'object' as const,
  properties: {
    structuredExplanationFormat: {
      type: 'string' as const,
      enum: Object.values(QuestionExplanationFormat),
      nullable: true,
      description:
        'Sibling of structuredExplanation; both are null when absent or hidden. Older records default to SIX_SECTION.',
    },
    structuredExplanation: {
      nullable: true,
      oneOf: explanationObjectSchemas.map((schema) => ({
        ...schema,
        additionalProperties: true,
      })),
      description:
        'Active educational sections plus existing explanation metadata; never contains the format.',
    },
  },
};
