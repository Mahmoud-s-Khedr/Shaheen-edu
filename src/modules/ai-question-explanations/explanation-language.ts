import { detectAll } from 'tinyld';

export const explanationLanguageNames: Record<string, string> = {
  ar: 'Arabic',
  en: 'English',
  de: 'German',
  fr: 'French',
};

/** Reject clear mismatches only: short, mixed, or ambiguous text needs review. */
export function hasExplanationLanguageMismatch(
  explanation: unknown,
  languageCode: string,
): boolean {
  if (!explanation || typeof explanation !== 'object') return false;
  const fields = [
    'answerElements',
    'scientificExplanation',
    'keywords',
    'eliminationStrategy',
    'whyCorrect',
    'generalRule',
    'whatIf',
    'commonMistakes',
  ];
  const samples = fields
    .map((key) => (explanation as Record<string, unknown>)[key])
    .filter((value): value is string => typeof value === 'string')
    .map((text) =>
      text
        .replace(/```[\s\S]*?```|`[^`]*`/g, ' ')
        .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, ' ')
        .replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, ' '),
    );
  return [...samples, samples.join(' ')].some((text) => {
    if ((text.match(/\p{L}/gu) ?? []).length < 40) return false;
    const [first, second] = detectAll(text);
    return (
      !!first &&
      first.lang !== languageCode &&
      first.accuracy >= 0.8 &&
      first.accuracy - (second?.accuracy ?? 0) >= 0.3
    );
  });
}
