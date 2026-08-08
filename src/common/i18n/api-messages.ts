import { HttpStatus } from '@nestjs/common';

export interface LocalizedMessage { ar: string; en: string; }
export interface ValidationDetail { field: string; code: string; message: LocalizedMessage; }

const statusTitles: Record<number, LocalizedMessage> = {
  [HttpStatus.BAD_REQUEST]: { ar: 'طلب غير صالح', en: 'Bad Request' },
  [HttpStatus.UNAUTHORIZED]: { ar: 'غير مصرح', en: 'Unauthorized' },
  [HttpStatus.FORBIDDEN]: { ar: 'ممنوع', en: 'Forbidden' },
  [HttpStatus.NOT_FOUND]: { ar: 'غير موجود', en: 'Not Found' },
  [HttpStatus.CONFLICT]: { ar: 'تعارض', en: 'Conflict' },
  [HttpStatus.TOO_MANY_REQUESTS]: { ar: 'طلبات كثيرة جداً', en: 'Too Many Requests' },
  [HttpStatus.INTERNAL_SERVER_ERROR]: { ar: 'خطأ داخلي في الخادم', en: 'Internal Server Error' },
};

const translations: Record<string, string> = {
  Unauthorized: 'غير مصرح', Forbidden: 'ممنوع', 'Internal server error': 'حدث خطأ داخلي في الخادم',
  'Invalid credentials': 'بيانات تسجيل الدخول غير صحيحة', 'Invalid phone number format': 'تنسيق رقم الهاتف غير صحيح',
  'Too many attempts. Please try again later.': 'محاولات كثيرة جداً. يرجى المحاولة لاحقاً.',
  'Academic grade not found': 'الصف الدراسي غير موجود', 'Governorate not found': 'المحافظة غير موجودة',
  'Center must belong to the selected governorate': 'يجب أن يتبع المركز المحافظة المحددة',
  'Center must belong to the student governorate': 'يجب أن يتبع المركز محافظة الطالب',
  'Student not found': 'الطالب غير موجود', 'Course not found': 'المادة الدراسية غير موجودة',
  'Subject not found': 'المادة الدراسية غير موجودة', 'Chapter not found': 'الفصل غير موجود',
  'Lesson not found': 'الدرس غير موجود', 'Section not found': 'القسم غير موجود',
  'Content item not found': 'عنصر المحتوى غير موجود', 'Partner not found': 'الشريك غير موجود',
  'Question not found': 'السؤال غير موجود', 'Question source not found': 'مصدر السؤال غير موجود',
  'Question bank not found': 'بنك الأسئلة غير موجود', 'Email already in use': 'البريد الإلكتروني مستخدم بالفعل',
  'Video is not ready for publication': 'الفيديو غير جاهز للنشر',
  'Phone number already registered': 'رقم الهاتف مسجل بالفعل', 'National ID already registered': 'الرقم القومي مسجل بالفعل',
  'Slug already in use': 'المعرّف المختصر مستخدم بالفعل', 'Record is already archived': 'السجل مؤرشف بالفعل',
};

const validationTranslations: Record<string, string> = {
  isString: 'يجب أن تكون القيمة نصاً', isNotEmpty: 'هذه القيمة مطلوبة', isDefined: 'هذه القيمة مطلوبة',
  minLength: 'القيمة أقصر من الحد الأدنى المسموح', maxLength: 'القيمة أطول من الحد الأقصى المسموح',
  matches: 'تنسيق القيمة غير صحيح', isEnum: 'القيمة غير مدعومة', isInt: 'يجب أن تكون القيمة عدداً صحيحاً',
  isBoolean: 'يجب أن تكون القيمة صحيحة أو خاطئة', isArray: 'يجب أن تكون القيمة قائمة',
  isOptional: 'القيمة اختيارية', arrayMinSize: 'القائمة لا تحتوي على عدد كافٍ من العناصر',
};

export function localizedMessage(message: string, statusCode: number): LocalizedMessage {
  return { en: message, ar: translations[message] ?? `تعذر تنفيذ الطلب: ${statusTitles[statusCode]?.ar ?? 'خطأ'}` };
}

export function localizedError(statusCode: number): LocalizedMessage {
  return statusTitles[statusCode] ?? statusTitles[HttpStatus.INTERNAL_SERVER_ERROR];
}

export function errorCode(message: string, statusCode: number, explicit?: string): string {
  if (explicit) return explicit;
  const family = statusTitles[statusCode]?.en.toUpperCase().replace(/[^A-Z0-9]+/g, '_') ?? 'ERROR';
  const key = message.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
  return `${family}.${key || 'REQUEST_FAILED'}`;
}

export function validationDetail(field: string, constraint: string, english: string): ValidationDetail {
  return { field, code: `VALIDATION.${constraint.toUpperCase()}`, message: { en: english, ar: validationTranslations[constraint] ?? 'قيمة الحقل غير صحيحة' } };
}
