import { hasExplanationLanguageMismatch } from './explanation-language';

const teachingText = {
  fr: 'La bonne réponse est obtenue en additionnant les deux quantités. Identifiez d’abord les valeurs dans la question, puis calculez leur somme et vérifiez soigneusement le résultat. Cette méthode permet de comprendre la règle et de résoudre des exercices similaires.',
  en: 'The correct answer follows from adding the two quantities together. First identify the values in the question, then calculate their sum and check the result carefully.',
  ar: 'الإجابة الصحيحة تنتج عن جمع الكميتين معا. نحدد أولا القيم الموجودة في السؤال ثم نحسب مجموعها ونتحقق من النتيجة بعناية. تساعد هذه الطريقة على فهم قاعدة الجمع وتطبيقها في المسائل المشابهة.',
  de: 'Die richtige Antwort ergibt sich aus der Addition der beiden Zahlen. Zuerst bestimmen wir die Werte in der Frage, dann berechnen wir ihre Summe und überprüfen das Ergebnis sorgfältig.',
};

describe('Explanation language validation', () => {
  it.each(['ar', 'en', 'de', 'fr'] as const)(
    'accepts %s teaching text',
    (language) => {
      expect(
        hasExplanationLanguageMismatch(
          { whyCorrect: teachingText[language] },
          language,
        ),
      ).toBe(false);
    },
  );
  it.each([
    ['ar', 'en'],
    ['en', 'ar'],
    ['de', 'en'],
    ['en', 'de'],
    ['fr', 'en'],
    ['en', 'fr'],
  ] as const)(
    'rejects clear %s request / %s output mismatch',
    (requested, actual) => {
      expect(
        hasExplanationLanguageMismatch(
          { whyCorrect: teachingText[actual] },
          requested,
        ),
      ).toBe(true);
    },
  );
  it('ignores quoted answers, formulas, and code', () => {
    expect(
      hasExplanationLanguageMismatch(
        {
          whyCorrect: `${teachingText.ar} "${teachingText.en}" $${teachingText.en}$ \`${teachingText.en}\``,
        },
        'ar',
      ),
    ).toBe(false);
  });
  it('does not reject short or non-linguistic sections', () => {
    expect(
      hasExplanationLanguageMismatch(
        { keywords: 'NaCl', whyCorrect: '2 + 2 = 4' },
        'ar',
      ),
    ).toBe(false);
  });

  it('catches a wrong-language section even if the rest is Arabic', () => {
    expect(
      hasExplanationLanguageMismatch(
        {
          keywords: teachingText.ar,
          eliminationStrategy: teachingText.ar,
          whyCorrect: teachingText.en,
          generalRule: teachingText.ar,
          whatIf: teachingText.ar,
          commonMistakes: teachingText.ar,
        },
        'ar',
      ),
    ).toBe(true);
  });
});
