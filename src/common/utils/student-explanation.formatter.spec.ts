import { formatStudentExplanation } from './student-explanation.formatter';

describe('formatStudentExplanation', () => {
  const structured = {
    languageCode: 'en',
    keywords: 'velocity, time',
    eliminationStrategy: 'Compare the units.',
    whyCorrect: 'Distance equals velocity times time.',
    generalRule: 'Check dimensions first.',
    whatIf: 'Doubling time doubles distance.',
    commonMistakes: 'Do not add unlike units.',
  };

  it('keeps flat text first and appends all English labelled sections', () => {
    expect(formatStudentExplanation('Existing explanation.', structured)).toBe(
      'Existing explanation.\n\nKeywords: velocity, time\n\nSolution strategy: Compare the units.\n\nWhy this is correct: Distance equals velocity times time.\n\nGeneral rule: Check dimensions first.\n\nWhat if?: Doubling time doubles distance.\n\nCommon mistakes: Do not add unlike units.',
    );
  });

  it('uses Arabic labels for Arabic language variants', () => {
    expect(
      formatStudentExplanation(null, {
        languageCode: 'ar-EG',
        keywords: 'السرعة والزمن',
        whyCorrect: 'المسافة تساوي السرعة في الزمن.',
      }),
    ).toBe(
      'الكلمات المفتاحية: السرعة والزمن\n\nلماذا هذه الإجابة صحيحة: المسافة تساوي السرعة في الزمن.',
    );
  });

  it('falls back to populated structured sections when flat text is absent', () => {
    expect(
      formatStudentExplanation('  ', {
        generalRule: 'Use the distributive property.',
      }),
    ).toBe('General rule: Use the distributive property.');
  });

  it('returns the flat explanation alone when there are no usable sections', () => {
    expect(formatStudentExplanation('  Keep this.  ', {})).toBe('Keep this.');
  });

  it('returns null for null, empty, and omitted values', () => {
    expect(formatStudentExplanation(null)).toBeNull();
    expect(formatStudentExplanation(' ', { keywords: '  ' })).toBeNull();
  });
});
