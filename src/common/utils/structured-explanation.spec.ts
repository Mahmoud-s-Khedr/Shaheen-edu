import { QuestionBanksService } from '../../modules/question-banks/question-banks.service';
import {
  explanationEnvelope,
  explanationFields,
  explanationPersistence,
  formatForQuestion,
  QuestionExplanationFormat as Format,
  validateStructuredExplanation,
} from './structured-explanation';
const written = {
  answerElements: 'Required answer',
  scientificExplanation: 'Supporting concepts',
  commonMistakes: 'Omissions',
  whatIf: 'Changed conditions',
};
const six = Object.fromEntries(
  explanationFields(Format.SIX_SECTION).map((key) => [key, key]),
);
describe('Format-aware explanations', () => {
  it.each(['SHORT_ANSWER', 'FILL_IN_THE_BLANK', 'LONG_ANSWER'])(
    'uses four sections for %s',
    (type) => expect(formatForQuestion(type)).toBe(Format.WRITTEN_FOUR_SECTION),
  );
  it.each(['SINGLE_CHOICE', 'MULTIPLE_CHOICE'])(
    'uses six sections for %s',
    (type) => expect(formatForQuestion(type)).toBe(Format.SIX_SECTION),
  );
  it.each([
    null,
    {},
    { ...written, whatIf: ' ' },
    { ...written, answerElements: 'x'.repeat(10001) },
    { ...written, keywords: 'mixed' },
    { ...written, structuredExplanationFormat: 'WRITTEN_FOUR_SECTION' },
    six,
  ])('rejects incomplete, mixed or mismatched written shape %j', (value) => {
    expect(() =>
      validateStructuredExplanation(value, Format.WRITTEN_FOUR_SECTION),
    ).toThrow();
  });
  it('clears inactive sections in both replacement directions', () => {
    expect(
      explanationPersistence(written, Format.WRITTEN_FOUR_SECTION),
    ).toMatchObject({ ...written, keywords: null, generalRule: null });
    expect(explanationPersistence(six)).toMatchObject({
      ...six,
      answerElements: null,
      scientificExplanation: null,
    });
  });
  it('serializes only active fields and retains metadata without mutating historical records', () => {
    const record = {
      ...explanationPersistence(written, Format.WRITTEN_FOUR_SECTION),
      languageCode: 'ar',
      origin: 'HUMAN',
    };
    const before = JSON.stringify(record);
    expect(explanationEnvelope(record)).toEqual({
      structuredExplanationFormat: Format.WRITTEN_FOUR_SECTION,
      structuredExplanation: {
        ...written,
        languageCode: 'ar',
        origin: 'HUMAN',
      },
    });
    expect(JSON.stringify(record)).toBe(before);
    expect(explanationEnvelope(six).structuredExplanationFormat).toBe(
      Format.SIX_SECTION,
    );
    expect(explanationEnvelope(null)).toEqual({
      structuredExplanationFormat: null,
      structuredExplanation: null,
    });
  });
  it('requires explicit four-section format for manual input and restricts it to written types', () => {
    const service = Object.create(
      QuestionBanksService.prototype,
    ) as QuestionBanksService;
    expect(() =>
      service['normalizeExplanation'](
        { structuredExplanation: written },
        'LONG_ANSWER',
      ),
    ).toThrow();
    expect(() =>
      service['normalizeExplanation'](
        {
          structuredExplanation: written,
          structuredExplanationFormat: Format.WRITTEN_FOUR_SECTION,
        },
        'SINGLE_CHOICE',
      ),
    ).toThrow();
    const dto = {
      structuredExplanation: written,
      structuredExplanationFormat: Format.WRITTEN_FOUR_SECTION,
    };
    service['normalizeExplanation'](dto, 'LONG_ANSWER');
    expect(dto.structuredExplanation).toMatchObject({
      answerElements: 'Required answer',
      keywords: null,
    });
  });
});
