import { HttpStatus } from '@nestjs/common';

export interface LocalizedMessage {
  ar: string;
  en: string;
}
export interface ValidationDetail {
  field: string;
  code: string;
  message: LocalizedMessage;
}

const statusTitles: Record<number, LocalizedMessage> = {
  [HttpStatus.BAD_REQUEST]: { ar: 'طلب غير صالح', en: 'Bad Request' },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    ar: 'حجم الطلب أكبر من المسموح',
    en: 'Payload Too Large',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    ar: 'نوع المحتوى غير مدعوم',
    en: 'Unsupported Media Type',
  },
  [HttpStatus.UNAUTHORIZED]: { ar: 'غير مصرح', en: 'Unauthorized' },
  [HttpStatus.FORBIDDEN]: { ar: 'ممنوع', en: 'Forbidden' },
  [HttpStatus.NOT_FOUND]: { ar: 'غير موجود', en: 'Not Found' },
  [HttpStatus.CONFLICT]: { ar: 'تعارض', en: 'Conflict' },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    ar: 'طلبات كثيرة جداً',
    en: 'Too Many Requests',
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    ar: 'خطأ داخلي في الخادم',
    en: 'Internal Server Error',
  },
};

const translations: Record<string, string> = {
  'Provide an answer object for this question':
    'أرسل كائناً يحتوي على إجابة لهذا السؤال',
  'selectedOptionIndexes must contain only non-negative whole numbers':
    'يجب أن تحتوي selectedOptionIndexes على أعداد صحيحة لا تقل عن صفر فقط',
  'acceptedAnswers must contain only non-blank text answers':
    'يجب أن تحتوي acceptedAnswers على إجابات نصية غير فارغة فقط',
  'Choice questions require selectedOptionIndexes only':
    'أسئلة الاختيار تتطلب selectedOptionIndexes فقط',
  'Written questions require acceptedAnswers only':
    'الأسئلة الكتابية تتطلب acceptedAnswers فقط',
  'nationalId must be digits (spaces/dashes allowed)':
    'يجب أن يحتوي الرقم القومي على أرقام فقط (يسمح بالمسافات والشرطات)',
  'Validation failed': 'يرجى تصحيح الحقول غير الصالحة وإعادة المحاولة',
  'Request body must contain valid JSON':
    'يجب أن يحتوي الطلب على بيانات JSON صالحة',
  'Request body is too large. Reduce its size and try again.':
    'حجم الطلب أكبر من المسموح. قلل حجمه وأعد المحاولة.',
  'Unsupported Content-Type. Use a media type accepted by this endpoint.':
    'نوع المحتوى غير مدعوم. استخدم نوع محتوى تقبله هذه الواجهة.',
  'A record with these values already exists':
    'يوجد سجل بهذه القيم بالفعل. استخدم قيماً مختلفة.',
  'The record is still referenced':
    'تعذر إتمام العملية بسبب ارتباط السجل بسجل آخر. تحقق من السجلات المرتبطة.',
  'Record not found': 'السجل غير موجود',
  'Concurrent update conflict; retry the request':
    'تم تعديل السجل في الوقت نفسه. أعد المحاولة.',
  Unauthorized: 'غير مصرح',
  Forbidden: 'ممنوع',
  'Internal server error': 'حدث خطأ داخلي في الخادم',
  'Invalid credentials': 'بيانات تسجيل الدخول غير صحيحة',
  'Invalid phone number format': 'تنسيق رقم الهاتف غير صحيح',
  'Too many attempts. Please try again later.':
    'محاولات كثيرة جداً. يرجى المحاولة لاحقاً.',
  'Academic grade not found': 'الصف الدراسي غير موجود',
  'Governorate not found': 'المحافظة غير موجودة',
  'Center must belong to the selected governorate':
    'يجب أن يتبع المركز المحافظة المحددة',
  'Center must belong to the student governorate':
    'يجب أن يتبع المركز محافظة الطالب',
  'Student not found': 'الطالب غير موجود',
  'Course not found': 'المادة الدراسية غير موجودة',
  'Subject not found': 'المادة الدراسية غير موجودة',
  'Chapter not found': 'الفصل غير موجود',
  'Lesson not found': 'الدرس غير موجود',
  'Section not found': 'القسم غير موجود',
  'Content item not found': 'عنصر المحتوى غير موجود',
  'Partner not found': 'الشريك غير موجود',
  'Question not found': 'السؤال غير موجود',
  'Question source not found': 'مصدر السؤال غير موجود',
  'Question bank not found': 'بنك الأسئلة غير موجود',
  'Email already in use': 'البريد الإلكتروني مستخدم بالفعل',
  'Video is not ready for publication': 'الفيديو غير جاهز للنشر',
  'Phone number already registered': 'رقم الهاتف مسجل بالفعل',
  'National ID already registered': 'الرقم القومي مسجل بالفعل',
  'Slug already in use': 'المعرّف المختصر مستخدم بالفعل',
  'Record is already archived': 'السجل مؤرشف بالفعل',
  'One or more visuals are already assigned to another candidate':
    'عنصر مرئي واحد أو أكثر مرتبط بالفعل بسؤال مرشح آخر',
};

const validationTranslations: Record<string, string> = {
  whitelistValidation: 'هذا الحقل غير مسموح به. احذفه من الطلب',
  unknownValue: 'يجب إرسال كائن يحتوي على الحقول المطلوبة',
  nestedValidation: 'يجب أن تكون القيمة كائناً يحتوي على حقول صالحة',
  isObject: 'يجب أن تكون القيمة كائناً',
  isNumber: 'يجب أن تكون القيمة رقماً صالحاً',
  isEmail: 'أدخل عنوان بريد إلكتروني صالحاً',
  isUrl: 'أدخل رابطاً صالحاً بالبروتوكول المطلوب',
  isDate: 'أدخل تاريخاً صالحاً',
  isDateString: 'أدخل تاريخاً صالحاً بتنسيق ISO 8601',
  isIn: 'اختر إحدى القيم المسموح بها',
  min: 'القيمة أقل من الحد الأدنى المسموح',
  max: 'القيمة أكبر من الحد الأقصى المسموح',
  arrayMaxSize: 'القائمة تتجاوز الحد الأقصى لعدد العناصر',
  arrayUnique: 'يجب ألا تحتوي القائمة على عناصر مكررة',
  isString: 'يجب أن تكون القيمة نصاً',
  isNotEmpty: 'هذه القيمة مطلوبة',
  isDefined: 'هذه القيمة مطلوبة',
  minLength: 'القيمة أقصر من الحد الأدنى المسموح',
  maxLength: 'القيمة أطول من الحد الأقصى المسموح',
  matches: 'تنسيق القيمة غير صحيح',
  isEnum: 'القيمة غير مدعومة',
  isInt: 'يجب أن تكون القيمة عدداً صحيحاً',
  isBoolean: 'يجب أن تكون القيمة صحيحة أو خاطئة',
  isArray: 'يجب أن تكون القيمة قائمة',
  isOptional: 'القيمة اختيارية',
  arrayMinSize: 'القائمة لا تحتوي على عدد كافٍ من العناصر',
};

export function localizedMessage(
  message: string,
  statusCode: number,
): LocalizedMessage {
  return {
    en: message,
    ar:
      translations[message] ??
      `تعذر تنفيذ الطلب: ${statusTitles[statusCode]?.ar ?? 'خطأ'}`,
  };
}

export function localizedError(statusCode: number): LocalizedMessage {
  return (
    statusTitles[statusCode] ?? statusTitles[HttpStatus.INTERNAL_SERVER_ERROR]
  );
}

export function errorCode(
  message: string,
  statusCode: number,
  explicit?: string,
): string {
  if (explicit) return explicit;
  const family =
    statusTitles[statusCode]?.en.toUpperCase().replace(/[^A-Z0-9]+/g, '_') ??
    'ERROR';
  const key = message
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return `${family}.${key || 'REQUEST_FAILED'}`;
}

export function validationDetail(
  field: string,
  constraint: string,
  english: string,
): ValidationDetail {
  return {
    field,
    code: `VALIDATION.${constraint.toUpperCase()}`,
    message: {
      en: english,
      ar: localizedValidationMessage(constraint, english),
    },
  };
}

/** Preserve validator limits and choices in Arabic without including submitted values. */
function localizedValidationMessage(
  constraint: string,
  english: string,
): string {
  const patterns: Record<string, [RegExp, (limit: string) => string]> = {
    minLength: [
      /must be longer than or equal to (\d+) characters$/,
      (n) => `يجب ألا يقل طول القيمة عن ${n} أحرف`,
    ],
    maxLength: [
      /must be shorter than or equal to (\d+) characters$/,
      (n) => `يجب ألا يزيد طول القيمة عن ${n} أحرف`,
    ],
    min: [
      /must not be less than (-?\d+(?:\.\d+)?)$/,
      (n) => `يجب ألا تقل القيمة عن ${n}`,
    ],
    max: [
      /must not be greater than (-?\d+(?:\.\d+)?)$/,
      (n) => `يجب ألا تزيد القيمة عن ${n}`,
    ],
    arrayMinSize: [
      /must contain at least (\d+) elements$/,
      (n) => `يجب أن تحتوي القائمة على ${n} عناصر على الأقل`,
    ],
    arrayMaxSize: [
      /must contain no more than (\d+) elements$/,
      (n) => `يجب ألا تحتوي القائمة على أكثر من ${n} عناصر`,
    ],
    isEnum: [
      /must be one of the following values: (.+)$/,
      (values) => `اختر إحدى القيم التالية: ${values}`,
    ],
    isIn: [
      /must be one of the following values: (.+)$/,
      (values) => `اختر إحدى القيم التالية: ${values}`,
    ],
  };
  const rule = patterns[constraint];
  const match = rule?.[0].exec(english);
  let message = match
    ? rule[1](match[1])
    : (translations[english] ??
      validationTranslations[constraint] ??
      'قيمة الحقل غير صحيحة');
  if (english.startsWith('each value in '))
    message = `لكل عنصر في القائمة: ${message}`;
  return message;
}
