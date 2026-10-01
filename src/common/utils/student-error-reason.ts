import { StudentErrorReason } from '../types/roles.enum';

export type StudentErrorReasonLabel = {
  code: StudentErrorReason;
  en: string;
  ar: string;
};

/** The only server-side source for student error-reason display labels. */
const labels: Record<StudentErrorReason, StudentErrorReasonLabel> = {
  [StudentErrorReason.DID_NOT_KNOW_HOW_TO_SOLVE]: {
    code: StudentErrorReason.DID_NOT_KNOW_HOW_TO_SOLVE,
    en: 'Not knowing how to solve the question at all',
    ar: 'عدم معرفة كيفية حل السؤال من الأساس',
  },
  [StudentErrorReason.DID_NOT_UNDERSTAND_THE_QUESTION]: {
    code: StudentErrorReason.DID_NOT_UNDERSTAND_THE_QUESTION,
    en: 'Not understanding the question',
    ar: 'عدم فهم السؤال',
  },
  [StudentErrorReason.MADE_A_CALCULATION_MISTAKE]: {
    code: StudentErrorReason.MADE_A_CALCULATION_MISTAKE,
    en: 'Making a calculation mistake',
    ar: 'ارتكاب خطأ في الحساب',
  },
  [StudentErrorReason.MADE_A_CARELESS_MISTAKE]: {
    code: StudentErrorReason.MADE_A_CARELESS_MISTAKE,
    en: 'Making a careless mistake',
    ar: 'ارتكاب خطأ بسبب عدم الانتباه',
  },
};

export function studentErrorReasonLabel(
  reason: StudentErrorReason,
): StudentErrorReasonLabel {
  return labels[reason];
}

export function allStudentErrorReasonLabels(): StudentErrorReasonLabel[] {
  return Object.values(labels);
}
