type StructuredExplanation =
  | {
      languageCode?: unknown;
      keywords?: unknown;
      eliminationStrategy?: unknown;
      whyCorrect?: unknown;
      generalRule?: unknown;
      whatIf?: unknown;
      commonMistakes?: unknown;
    }
  | null
  | undefined;

const englishLabels = {
  keywords: 'Keywords',
  eliminationStrategy: 'Solution strategy',
  whyCorrect: 'Why this is correct',
  generalRule: 'General rule',
  whatIf: 'What if?',
  commonMistakes: 'Common mistakes',
};

const arabicLabels: typeof englishLabels = {
  keywords: 'الكلمات المفتاحية',
  eliminationStrategy: 'استراتيجية الحل',
  whyCorrect: 'لماذا هذه الإجابة صحيحة',
  generalRule: 'القاعدة العامة',
  whatIf: 'ماذا لو؟',
  commonMistakes: 'الأخطاء الشائعة',
};

const structuredFields = [
  'keywords',
  'eliminationStrategy',
  'whyCorrect',
  'generalRule',
  'whatIf',
  'commonMistakes',
] as const;

function usableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function structuredExplanation(value: unknown): StructuredExplanation {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as StructuredExplanation)
    : undefined;
}

/**
 * Returns the backwards-compatible student explanation text. Only educational
 * content is rendered, deliberately excluding structured explanation metadata.
 */
export function formatStudentExplanation(
  explanation: string | null | undefined,
  structuredExplanationValue?: unknown,
): string | null {
  const structured = structuredExplanation(structuredExplanationValue);
  const flatExplanation = usableText(explanation);
  const labels =
    typeof structured?.languageCode === 'string' &&
    structured.languageCode.trim().toLowerCase().startsWith('ar')
      ? arabicLabels
      : englishLabels;
  const sections = structuredFields.flatMap((field) => {
    const value = usableText(structured?.[field]);
    return value ? [`${labels[field]}: ${value}`] : [];
  });
  return [flatExplanation, ...sections].filter(Boolean).join('\n\n') || null;
}
