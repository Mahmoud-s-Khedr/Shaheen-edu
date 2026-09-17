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
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    ar: 'الخدمة غير متاحة',
    en: 'Service Unavailable',
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
  'A support reason is required for this Student 360 access':
    'يجب إدخال سبب للدعم للوصول إلى بيانات الطالب التفصيلية',
  'A reason is required for this privileged export':
    'يجب إدخال سبب لإنشاء هذا التقرير ذي الصلاحيات الخاصة',
  'Move produced a duplicate sortOrder within a scope':
    'أدى النقل إلى تكرار ترتيب العرض داخل النطاق',
  'Reorder produced a duplicate sort order':
    'أدى تغيير الترتيب إلى تكرار ترتيب العرض',
  'Reorder produced a duplicate sortOrder within this scope':
    'أدى تغيير الترتيب إلى تكرار ترتيب العرض داخل هذا النطاق',
  'Screenshot is already attached to a testimonial':
    'لقطة الشاشة مرتبطة بالفعل بشهادة أخرى',
  'Reorder produced a duplicate sortOrder within this target':
    'أدى تغيير الترتيب إلى تكرار ترتيب العرض داخل الهدف المحدد',
  'Move produced a duplicate sortOrder within a target':
    'أدى النقل إلى تكرار ترتيب العرض داخل الهدف المحدد',
  'Service dependencies are unavailable':
    'تعذر الاتصال بإحدى خدمات النظام المطلوبة. أعد المحاولة لاحقًا',
  'AI provider returned an invalid response':
    'أعاد مزود الذكاء الاصطناعي استجابة غير صالحة',
  'A body or contentBlocks is required': 'مطلوب نص أو contentBlocks',
  'A course must have an explicit access type':
    'يجب أن يكون للدورة التدريبية نوع وصول صريح',
  'A cover must be an image asset': 'يجب أن يكون الغلاف أحد أصول الصورة',
  'A file is required': 'مطلوب ملف',
  'A note is required for OTHER reports': 'ملاحظة مطلوبة لتقارير أخرى',
  'A published chapter must remain under a published course':
    'يجب أن يبقى الفصل المنشور ضمن الدورة المنشورة',
  'A published course must remain under a published subject':
    'يجب أن تظل الدورة المنشورة تحت موضوع منشور',
  'A published lesson must remain under a published chapter':
    'يجب أن يبقى الدرس المنشور ضمن الفصل المنشور',
  'A published section must remain under a published lesson':
    'يجب أن يبقى القسم المنشور ضمن الدرس المنشور',
  'A published subject must remain under a published academic grade':
    'يجب أن يبقى الموضوع المنشور تحت الدرجة الأكاديمية المنشورة',
  'A question or option visual may be owned only once per candidate':
    'يجوز امتلاك السؤال أو الخيار المرئي مرة واحدة فقط لكل مرشح',
  'A replacement must keep the same publisher and coverage target':
    'يجب أن يحتفظ البديل بنفس الناشر وهدف التغطية',
  'A resolution note is required': 'مطلوب مذكرة القرار',
  'A selected order item already has a refund request':
    'يحتوي عنصر الطلب المحدد بالفعل على طلب استرداد',
  'A settlement allocation is no longer payable':
    'ولم يعد مخصص التسوية مستحق الدفع',
  'A settlement requires payable allocations for one partner and currency':
    'تتطلب التسوية مخصصات مستحقة الدفع لشريك واحد وعملة واحدة',
  'A settlement total cannot be zero': 'لا يمكن أن يكون إجمالي التسوية صفراً',
  'A testimonial needs review text or a screenshot':
    'تحتاج الشهادة إلى نص مراجعة أو لقطة شاشة',
  'A valid entitlement is required': 'مطلوب استحقاق صالح',
  'A student device session is already active':
    'لدى الطالب جلسة جهاز نشطة بالفعل',
  'AI assessment request failed': 'فشل طلب تقييم الذكاء الاصطناعي',
  'AI assessment returned invalid JSON':
    'أعاد تقييم الذكاء الاصطناعي JSON غير صالح',
  'AI assessment service is not configured':
    'لم يتم تكوين خدمة تقييم الذكاء الاصطناعي',
  'AI explanation request failed': 'فشل طلب تفسير الذكاء الاصطناعي',
  'AI question explanation is not configured':
    'لم يتم تكوين شرح سؤال الذكاء الاصطناعي',
  'AI question import is not configured':
    'لم يتم تكوين استيراد سؤال الذكاء الاصطناعي',
  'AI re-answer run not found':
    'لم يتم العثور على تشغيل إعادة الإجابة بالذكاء الاصطناعي',
  'AI returned an incomplete structured explanation':
    'أعاد الذكاء الاصطناعي تفسيرًا منظمًا غير مكتمل',
  'AI returned an invalid answer grade':
    'أعاد الذكاء الاصطناعي درجة إجابة غير صالحة',
  'AI returned an invalid quiz selection':
    'أعاد الذكاء الاصطناعي تحديد اختبار غير صالح',
  'AI returned invalid answer highlights':
    'أعاد الذكاء الاصطناعي أبرز الإجابات غير الصالحة',
  'AI speech-to-text service is not configured':
    'لم يتم تكوين خدمة تحويل الكلام إلى نص باستخدام الذكاء الاصطناعي',
  'AI-inferred answers must be human-reviewed before publication':
    'يجب أن تخضع الإجابات المستنتجة بواسطة الذكاء الاصطناعي لمراجعة بشرية قبل نشرها',
  'Academic grade must be published': 'يجب نشر الدرجة الأكاديمية',
  'Accessible assessment video not found':
    'لم يتم العثور على فيديو التقييم الذي يمكن الوصول إليه',
  'Accessible video not found':
    'لم يتم العثور على الفيديو الذي يمكن الوصول إليه',
  'Active analytics entitlement not found':
    'لم يتم العثور على استحقاق التحليلات النشطة',
  'Active payment method not found': 'لم يتم العثور على طريقة الدفع النشطة',
  'Admin not found': 'لم يتم العثور على المشرف',
  'Agreement activation conflicted; retry the request':
    'تعارض تفعيل الاتفاقية؛ أعد محاولة الطلب',
  'All assessment questions must belong to the same subject':
    'يجب أن تنتمي جميع أسئلة التقييم إلى نفس الموضوع',
  'All assessment scopes must belong to the assessment subject':
    'يجب أن تنتمي جميع نطاقات التقييم إلى موضوع التقييم',
  'All question placements must belong to the question course':
    'يجب أن تنتمي جميع مواضع الأسئلة إلى دورة الأسئلة',
  'All selected question banks must belong to the same subject':
    'يجب أن تنتمي جميع بنوك الأسئلة المختارة إلى نفس الموضوع',
  'All selected scopes must belong to the question bank subject':
    'يجب أن تنتمي جميع النطاقات المحددة إلى موضوع بنك الأسئلة',
  'All-products coupons cannot have selected targets':
    'لا يمكن أن تحتوي قسائم جميع المنتجات على أهداف محددة',
  'All-products promotions cannot have selected targets':
    'لا يمكن أن يكون للعروض الترويجية لجميع المنتجات أهداف محددة',
  'An active report of this type already exists':
    'يوجد بالفعل تقرير نشط من هذا النوع',
  'An allocation was reversed concurrently': 'تم عكس التخصيص في نفس الوقت',
  'An asset may appear only once in contentBlocks':
    'قد يظهر الأصل مرة واحدة فقط في contentBlocks',
  'An audio file is required': 'مطلوب ملف صوتي',
  'An ended referral program cannot be resumed':
    'لا يمكن استئناف برنامج الإحالة المنتهي',
  'An explanation can be applied alone only when its answer matches the question':
    'لا يمكن تطبيق التفسير بمفرده إلا عندما تتطابق إجابته مع السؤال',
  'An import item that already created a question cannot be accepted again':
    'لا يمكن قبول عنصر الاستيراد الذي أنشأ سؤالاً بالفعل مرة أخرى',
  'An inherited chapter is not sold separately':
    'ولا يباع الفصل الموروث منفصلا',
  'Answer is not awaiting AI grading': 'الجواب لا ينتظر تصنيف الذكاء الاصطناعي',
  'Approved order not found': 'لم يتم العثور على الطلب المعتمد',
  'Archived access is required': 'الوصول إلى الأرشيف مطلوب',
  'Archived access snapshot not found':
    'لم يتم العثور على لقطة الوصول المؤرشفة',
  'Archived assets cannot be linked': 'لا يمكن ربط الأصول المؤرشفة',
  'Archived content cannot be moved': 'لا يمكن نقل المحتوى المؤرشف',
  'Archived courses cannot be used': 'لا يمكن استخدام الدورات المؤرشفة',
  'Archived questions cannot be re-answered':
    'لا يمكن إعادة الإجابة على الأسئلة المؤرشفة',
  'Archived testimonials must be restored first':
    'يجب استعادة الشهادات المؤرشفة أولاً',
  'Assessment answer not found': 'لم يتم العثور على إجابة التقييم',
  'Assessment is not accessible': 'التقييم لا يمكن الوصول إليه',
  'Assessment is not available to attempt': 'التقييم غير متاح للمحاولة',
  'Assessment not found': 'لم يتم العثور على التقييم',
  'Assessment question attachment not found':
    'لم يتم العثور على مرفق سؤال التقييم',
  'Assessment question not found': 'لم يتم العثور على سؤال التقييم',
  'Asset blocks require a PDF, document, downloadable file, or video asset':
    'تتطلب كتل الأصول ملف PDF أو مستندًا أو ملفًا قابلاً للتنزيل أو أصل فيديو',
  'Asset cannot be completed in its current state':
    'لا يمكن إكمال الأصل في حالته الحالية',
  'Asset has no file delivery URL': 'لا يحتوي الأصل على عنوان URL لتسليم الملف',
  'Asset is not attached to content item': 'الأصل غير مرفق بعنصر المحتوى',
  'Asset is not ready': 'الأصول ليست جاهزة',
  'Asset kind is incompatible with content type':
    'نوع الأصل غير متوافق مع نوع المحتوى',
  'Asset not found': 'لم يتم العثور على الأصول',
  'Asset preview is not available': 'معاينة الأصول غير متاحة',
  'Asset-backed content requires a primary asset before publication':
    'يتطلب المحتوى المدعوم بالأصول وجود أصل أساسي قبل النشر',
  'Assignee must be an administrator': 'يجب أن يكون المكلف مسؤولاً',
  'Assignments may reference only eligible media from this PDF import':
    'قد تشير المهام إلى الوسائط المؤهلة فقط من استيراد ملف PDF هذا',
  'At least one academic grade is required':
    'مطلوب درجة أكاديمية واحدة على الأقل',
  'At least one target is required': 'مطلوب هدف واحد على الأقل',
  'Attachment must be a ready image, PDF, or document':
    'يجب أن يكون المرفق صورة جاهزة أو PDF أو مستند',
  'Attachment not found': 'لم يتم العثور على المرفق',
  'Attempt has not been submitted yet': 'لم يتم تقديم المحاولة بعد',
  'Attempt is no longer in progress': 'المحاولة لم تعد قيد التقدم',
  'Audio file exceeds the transcription limit': 'الملف الصوتي يتجاوز حد النسخ',
  'Audio file exceeds the upload limit': 'يتجاوز الملف الصوتي حد التحميل',
  'Bunny Stream could not create the video':
    'تعذر على Bunny Stream إنشاء الفيديو',
  'Bunny Stream could not delete the video':
    'تعذر على Bunny Stream حذف الفيديو',
  'Bunny Stream returned no video ID': 'لم يُرجع Bunny Stream معرف الفيديو',
  'CONTENT_PUBLISHER source requires publisherUserId':
    'يتطلب مصدر CONTENT_PUBLISHER معرف PublisherUserId',
  'Candidate confidence must be between zero and one':
    'يجب أن تكون ثقة المرشح بين صفر وواحد',
  'Candidate evidence keys must be strings':
    'يجب أن تكون مفاتيح أدلة المرشح عبارة عن سلاسل',
  'Candidate must contain a supported type, body, and explanation':
    'يجب أن يحتوي المرشح على نوع ونص وشرح مدعوم',
  'Candidate warnings must be strings':
    'يجب أن تكون تحذيرات المرشح عبارة عن سلاسل',
  'Cannot add a code to an ended program': 'لا يمكن إضافة رمز إلى برنامج منتهي',
  'Cannot add a subject to an archived academic grade':
    'لا يمكن إضافة مادة إلى درجة أكاديمية مؤرشفة',
  'Cannot add chapters to an archived course':
    'لا يمكن إضافة فصول إلى المقرر الدراسي المؤرشف',
  'Cannot add courses to an archived subject':
    'لا يمكن إضافة دورات إلى موضوع مؤرشف',
  'Cannot add lessons to an archived chapter':
    'لا يمكن إضافة الدروس إلى الفصل المؤرشف',
  'Cannot add sections to an archived lesson':
    'لا يمكن إضافة أقسام إلى الدرس المؤرشف',
  'Cannot add subjects to an archived academic grade':
    'لا يمكن إضافة مواد إلى الصف الأكاديمي المؤرشف',
  'Cannot archive a record with published descendants':
    'لا يمكن أرشفة سجل يحتوي على فروع منشورة',
  'Cannot archive a source or bank with published questions':
    'لا يمكن أرشفة المصدر أو البنك بالأسئلة المنشورة',
  'Cannot delete a chapter with lessons': 'لا يمكن حذف فصل مع الدروس',
  'Cannot delete a course with chapters':
    'لا يمكن حذف دورة تدريبية تحتوي على فصول',
  'Cannot delete a lesson with sections':
    'لا يمكن حذف الدرس الذي يحتوي على أقسام',
  'Cannot delete a subject with courses': 'لا يمكن حذف موضوع مع الدورات',
  'Cannot delete an academic grade with subjects':
    'لا يمكن حذف الدرجة الأكاديمية مع المواد',
  'Cannot move into an archived academic grade':
    'لا يمكن الانتقال إلى الصف الأكاديمي المؤرشف',
  'Cannot move into an archived chapter': 'لا يمكن الانتقال إلى الفصل المؤرشف',
  'Cannot move into an archived course':
    'لا يمكن الانتقال إلى المقرر الدراسي المؤرشف',
  'Cannot move into an archived lesson': 'لا يمكن الانتقال إلى الدرس المؤرشف',
  'Cannot move into an archived subject': 'لا يمكن الانتقال إلى موضوع مؤرشف',
  'Cannot place content in an archived target':
    'لا يمكن وضع المحتوى في هدف مؤرشف',
  'Cannot remove a grade that still has courses for this subject':
    'لا يمكن إزالة التقدير الذي لا يزال يحتوي على مقررات دراسية لهذا الموضوع',
  'Capped percentage rules require percentageBps and maximumCommissionMinor':
    'تتطلب قواعد النسبة المئوية المحددة نسبة مئوية في الثانية والحد الأقصى للعمولة الصغرى',
  'Cart already contains overlapping content':
    'تحتوي سلة التسوق بالفعل على محتوى متداخل',
  'Cart is empty': 'العربة فارغة',
  'Cart item not found': 'لم يتم العثور على عنصر سلة التسوق',
  'Center already exists in this governorate':
    'المركز موجود بالفعل في هذه المحافظة',
  'Center cannot be deleted while referenced':
    'لا يمكن حذف المركز أثناء الإشارة إليه',
  'Changing a question course requires replacement placements':
    'يتطلب تغيير دورة الأسئلة استبدال المواضع',
  'Chapter is not purchasable': 'الفصل غير قابل للشراء',
  'Chapter target not found': 'لم يتم العثور على هدف الفصل',
  'Choice answer indexes are invalid': 'فهارس إجابات الاختيار غير صالحة',
  'Choice candidate does not satisfy its answer type':
    'مرشح الاختيار لا يلبي نوع إجابته',
  'Choice candidates require options and selected indexes':
    'يتطلب مرشحو الاختيار خيارات وفهارس مختارة',
  'Constant key already exists for this subject':
    'المفتاح الثابت موجود بالفعل لهذا الموضوع',
  'Constant key must not be blank': 'يجب ألا يكون المفتاح الثابت فارغًا',
  'Content block asset is incompatible': 'أصل كتلة المحتوى غير متوافق',
  'Content block asset must be ready': 'يجب أن تكون أصول كتلة المحتوى جاهزة',
  'Content block payload is too large': 'حمولة كتلة المحتوى كبيرة جدًا',
  'Content block video must be ready': 'يجب أن يكون فيديو كتلة المحتوى جاهزًا',
  'Content is already entitled': 'المحتوى يحق له بالفعل',
  'Content is not available for this academic grade':
    'المحتوى غير متوفر لهذا الصف الأكاديمي',
  'Content is not published': 'لا يتم نشر المحتوى',
  'Content item requires a placement': 'يتطلب عنصر المحتوى موضعًا',
  'Content not found': 'لم يتم العثور على المحتوى',
  'Content placement ordering is invalid': 'ترتيب موضع المحتوى غير صالح',
  'Content placement target not found': 'لم يتم العثور على هدف موضع المحتوى',
  'Content publisher reporting is not available for this partner':
    'تقارير ناشري المحتوى غير متاحة لهذا الشريك',
  'Content requires a ready, compatible primary asset':
    'يتطلب المحتوى أصلًا أساسيًا جاهزًا ومتوافقًا',
  'Context media must reference a context key from this candidate':
    'يجب أن تشير وسائط السياق إلى مفتاح السياق من هذا المرشح',
  'Coupon code must use letters, numbers, hyphens, or underscores':
    'يجب أن يستخدم رمز القسيمة أحرفًا أو أرقامًا أو واصلات أو شرطات سفلية',
  'Coupon does not apply to the selected items':
    'الكوبون لا ينطبق على العناصر المحددة',
  'Coupon does not improve the current price': 'القسيمة لا تحسن السعر الحالي',
  'Coupon is invalid or inactive': 'القسيمة غير صالحة أو غير نشطة',
  'Coupon minimum order amount is not met':
    'لم يتم استيفاء الحد الأدنى لمبلغ الطلب الخاص بالقسيمة',
  'Coupon not found': 'لم يتم العثور على القسيمة',
  'Coupon usage limit has been reached': 'تم الوصول إلى حد استخدام القسيمة',
  'Coupon usage limit has been reached for this student':
    'لقد تم الوصول إلى حد استخدام القسيمة لهذا الطالب',
  'Course is not purchasable': 'الدورة غير قابلة للشراء',
  'Course target not found': 'لم يتم العثور على هدف الدورة التدريبية',
  'Cover image not found': 'لم يتم العثور على صورة الغلاف',
  'Created items cannot be retried':
    'لا يمكن إعادة محاولة العناصر التي تم إنشاؤها',
  'Deleted students cannot be suspended': 'لا يمكن تعليق الطلاب المحذوفين',
  'Deletion reason is required': 'سبب الحذف مطلوب',
  'Discount campaign not found': 'لم يتم العثور على حملة الخصم',
  'EXTERNAL_LINK content requires a valid HTTPS externalUrl':
    'يتطلب محتوى EXTERNAL_LINK عنوان URL خارجيًا صالحًا لـ HTTPS',
  'Each allocation can be selected only once':
    'يمكن اختيار كل تخصيص مرة واحدة فقط',
  'Each approved order can be selected only once':
    'يمكن اختيار كل أمر تمت الموافقة عليه مرة واحدة فقط',
  'Each order item can be requested only once':
    'يمكن طلب كل عنصر طلب مرة واحدة فقط',
  'Each promotion target must be one course or chapter':
    'يجب أن يكون كل هدف ترويجي عبارة عن دورة أو فصل واحد',
  'Each question placement must have exactly one target':
    'يجب أن يكون لكل موضع سؤال هدف واحد بالضبط',
  'Each scope must have exactly one target':
    'يجب أن يكون لكل نطاق هدف واحد بالضبط',
  'Each visual may be assigned only once to the same candidate owner':
    'يجوز تعيين كل عنصر مرئي مرة واحدة فقط لنفس المالك المرشح',
  'Eligible question asset not found': 'لم يتم العثور على أصل السؤال المؤهل',
  'Eligible question not found': 'لم يتم العثور على سؤال مؤهل',
  'Empty files are not allowed': 'الملفات الفارغة غير مسموح بها',
  'Entitlement not found': 'لم يتم العثور على استحقاق',
  'Equation blocks require LaTeX or MathML':
    'تتطلب كتل المعادلات LaTeX أو MathML',
  'Every chapter ancestor must be published': 'يجب نشر كل سلف الفصل',
  'Every parent in the ancestry must be published': 'يجب نشر كل والد في النسب',
  'Every question must have a published placement within one of the given scopes':
    'يجب أن يكون لكل سؤال موضع منشور ضمن أحد النطاقات المحددة',
  'Excluded items cannot be retried': 'لا يمكن إعادة محاولة العناصر المستبعدة',
  'Export belongs to another administrator': 'التصدير ينتمي إلى مسؤول آخر',
  'Export classification no longer matches its report policy':
    'لم يعد تصنيف التصدير يتطابق مع سياسة التقرير الخاصة به',
  'Export is not available': 'التصدير غير متوفر',
  'Export not found': 'لم يتم العثور على التصدير',
  'Export queue is unavailable': 'قائمة انتظار التصدير غير متوفرة',
  'FAILED is reserved for materialization errors':
    'تم حجز FAILED لأخطاء التجسيد',
  'File exceeds configured size limit':
    'يتجاوز الملف الحد الأقصى للحجم الذي تم تكوينه',
  'File signature does not match declared MIME type':
    'توقيع الملف لا يطابق نوع MIME المعلن',
  'Filename extension does not match declared type':
    'ملحق اسم الملف لا يتطابق مع النوع المعلن',
  'Fixed agreements currently support EGP only':
    'تدعم الاتفاقيات الثابتة حاليًا الجنيه المصري فقط',
  'Fixed agreements require fixedPayoutMinor':
    'تتطلب الاتفاقيات الثابتة دفعًا ثابتًا',
  'Fixed rules require fixedCommissionMinor':
    'تتطلب القواعد الثابتة عمولة ثابتة',
  'Global programs cannot specify a coverage target':
    'لا يمكن للبرامج العالمية تحديد هدف التغطية',
  'Governorate already exists': 'المحافظة موجودة بالفعل',
  'Governorate cannot be deleted while referenced':
    'لا يمكن حذف المحافظة أثناء الإشارة إليها',
  'Hierarchy record not found': 'لم يتم العثور على سجل التسلسل الهرمي',
  'Highlight offsets and selectedText must match the question text':
    'قم بتمييز الإزاحات ويجب أن يتطابق النص المحدد مع نص السؤال',
  'INFER requests cannot include suppliedAnswer':
    'لا يمكن أن تتضمن طلبات INFER الإجابة المقدمة',
  'Idempotency-Key header is required': 'مطلوب رأس Idempotency-Key',
  'Idempotency-Key header must not exceed 200 characters':
    'يجب ألا يتجاوز رأس Idempotency-Key 200 حرفًا',
  'Image blocks require an image asset': 'تتطلب كتل الصور أصل صورة',
  'Imported question does not satisfy its answer type':
    'السؤال المستورد لا يتوافق مع نوع إجابته',
  'Invalid Bunny Stream payload': 'حمولة Bunny Stream غير صالحة',
  'Invalid Bunny Stream signature': 'توقيع Bunny Stream غير صالح',
  'Invalid Bunny webhook payload': 'حمولة خطاف الويب Bunny غير صالحة',
  'Invalid Cairo date range': 'النطاق الزمني للقاهرة غير صالح',
  'Invalid XPay signature': 'توقيع XPay غير صالح',
  'Invalid cursor': 'المؤشر غير صالح',
  'Invalid date range': 'النطاق الزمني غير صالح',
  'Invalid filename': 'اسم الملف غير صالح',
  'Invalid national ID format': 'تنسيق الهوية الوطنية غير صالح',
  'Invalid parent phone number format': 'تنسيق رقم هاتف الوالدين غير صالح',
  'Item is already in cart': 'العنصر موجود بالفعل في سلة التسوق',
  'Leaderboard week not found': 'لم يتم العثور على أسبوع المتصدرين',
  'Long-answer candidates require a grading rubric':
    'يحتاج المرشحون ذوو الإجابات الطويلة إلى نموذج تقييم',
  'Long-answer questions require a grading rubric for AI grading':
    'تتطلب الأسئلة ذات الإجابة الطويلة نموذج تقييم لتصنيف الذكاء الاصطناعي',
  'Long-answer questions require gradingRubric only':
    'تتطلب الأسئلة ذات الإجابة الطويلة وضع الدرجات فقط',
  'Media blocks require assetId': 'تتطلب كتل الوسائط معرف الأصول',
  'Mixed content must be updated with an explicit contentBlocks payload':
    'يجب تحديث المحتوى المختلط بحمولة contentBlocks صريحة',
  'No accessible published content exists for this target':
    'لا يوجد محتوى منشور يمكن الوصول إليه لهذا الهدف',
  'No attempt has been started for this assessment':
    'لم تبدأ أي محاولة لهذا التقييم',
  'No child imports require retry':
    'لا تتطلب أي عمليات استيراد فرعية إعادة المحاولة',
  'No child selected': 'لم يتم تحديد أي طفل',
  'No child selected for this session': 'لم يتم اختيار أي طفل لهذه الجلسة',
  'Non-purchasable pricing cannot include price or currency':
    'لا يمكن أن يتضمن التسعير غير القابل للشراء السعر أو العملة',
  'Not enough eligible questions in the selected scope':
    'لا توجد أسئلة مؤهلة كافية في النطاق المحدد',
  'Note must not be blank': 'يجب ألا تكون الملاحظة فارغة',
  'Notebook page not found': 'لم يتم العثور على صفحة دفتر الملاحظات',
  'Old password is incorrect': 'كلمة المرور القديمة غير صحيحة',
  'One or more Student 360 sections are invalid':
    'قسم واحد أو أكثر من أقسام Student 360 غير صالح',
  'One or more allocations are already in a settlement':
    'يوجد تخصيص واحد أو أكثر في التسوية بالفعل',
  'One or more allocations were not found':
    'لم يتم العثور على تخصيص واحد أو أكثر',
  'One or more order items do not belong to this order':
    'واحد أو أكثر من عناصر الطلب لا تنتمي إلى هذا الطلب',
  'One or more question banks are not accessible':
    'لا يمكن الوصول إلى واحد أو أكثر من بنوك الأسئلة',
  'One or more questionIds are invalid or not published':
    'واحد أو أكثر من معرفات الأسئلة غير صالح أو لم يتم نشره',
  'One or more questions are not accessible in the selected scope':
    'لا يمكن الوصول إلى سؤال واحد أو أكثر في النطاق المحدد',
  'One or more selected columns are not allowed for this report':
    'لا يُسمح بعمود واحد أو أكثر محدد لهذا التقرير',
  'Only EGP is supported': 'يتم دعم الجنيه المصري فقط',
  'Only a draft academic grade can be deleted':
    'يمكن حذف مسودة الدرجة الأكاديمية فقط',
  'Only a draft chapter can be deleted': 'يمكن حذف مسودة الفصل فقط',
  'Only a draft content item can be deleted': 'يمكن حذف عنصر محتوى مسودة فقط',
  'Only a draft course can be deleted': 'يمكن حذف مسودة الدورة التدريبية فقط',
  'Only a draft lesson can be deleted': 'يمكن حذف مسودة الدرس فقط',
  'Only a draft record can be published': 'يمكن نشر مسودة السجل فقط',
  'Only a draft section can be deleted': 'يمكن حذف قسم المسودة فقط',
  'Only a draft subject can be deleted': 'يمكن حذف مسودة الموضوع فقط',
  'Only a draft testimonial can be deleted': 'يمكن حذف مسودة الشهادة فقط',
  'Only a never-published draft assessment can be deleted':
    'لا يمكن حذف سوى مسودة التقييم التي لم يتم نشرها مطلقًا',
  'Only active administrators can be reset':
    'يمكن إعادة تعيين المسؤولين النشطين فقط',
  'Only active agreements can be ended': 'يمكن إنهاء الاتفاقيات النشطة فقط',
  'Only active agreements can be replaced':
    'يمكن استبدال الاتفاقيات النشطة فقط',
  'Only active referral programs can be ended or suspended':
    'يمكن إنهاء أو تعليق برامج الإحالة النشطة فقط',
  'Only active students can be reset': 'يمكن إعادة تعيين الطلاب النشطين فقط',
  'Only an unreferenced draft question can be deleted':
    'يمكن حذف مسودة سؤال غير مرجعية فقط',
  'Only archived records can be restored': 'يمكن استعادة السجلات المؤرشفة فقط',
  'Only archived testimonials can be restored':
    'يمكن استعادة الشهادات المؤرشفة فقط',
  'Only draft agreements can be activated': 'يمكن تفعيل مشاريع الاتفاقيات فقط',
  'Only draft agreements can be updated': 'يمكن تحديث مسودات الاتفاقيات فقط',
  'Only draft assessments can be published': 'يمكن نشر مسودات التقييمات فقط',
  'Only draft assessments can be updated': 'يمكن تحديث مسودة التقييمات فقط',
  'Only draft or rejected questions can be submitted':
    'يمكن تقديم الأسئلة المسودة أو المرفوضة فقط',
  'Only draft records can be edited': 'يمكن تحرير مسودات السجلات فقط',
  'Only draft referral programs can be activated':
    'يمكن تفعيل مسودة برامج الإحالة فقط',
  'Only draft referral programs can be edited':
    'يمكن تحرير مسودات برامج الإحالة فقط',
  'Only draft, rejected, or published questions can receive an AI re-answer result':
    'يمكن فقط للأسئلة المسودة أو المرفوضة أو المنشورة الحصول على نتيجة إعادة الإجابة على الذكاء الاصطناعي',
  'Only failed import chunks can be retried':
    'يمكن إعادة محاولة قطع الاستيراد الفاشلة فقط',
  'Only failed media can be retried': 'يمكن إعادة محاولة الوسائط الفاشلة فقط',
  'Only failed or review-required pages can be retried':
    'يمكن إعادة المحاولة فقط للصفحات الفاشلة أو التي تتطلب المراجعة',
  'Only failed video assets can be retried':
    'يمكن إعادة محاولة أصول الفيديو الفاشلة فقط',
  'Only failed, review-required, or completed-with-errors imports can be retried':
    'يمكن إعادة محاولة عمليات الاستيراد الفاشلة أو التي تتطلب المراجعة أو المكتملة مع وجود أخطاء فقط',
  'Only pending refund requests can be approved':
    'يمكن الموافقة على طلبات استرداد الأموال المعلقة فقط',
  'Only pending refund requests can be rejected':
    'يمكن رفض طلبات استرداد الأموال المعلقة فقط',
  'Only pending runs can be applied': 'يمكن تطبيق عمليات التشغيل المعلقة فقط',
  'Only pending runs can be rejected': 'يمكن رفض عمليات التشغيل المعلقة فقط',
  'Only published assessments can be archived':
    'يمكن أرشفة التقييمات المنشورة فقط',
  'Only questions in review can be published':
    'يمكن نشر الأسئلة قيد المراجعة فقط',
  'Only questions in review can be rejected':
    'يمكن رفض الأسئلة قيد المراجعة فقط',
  'Only queued or processing exports can be cancelled':
    'يمكن إلغاء عمليات التصدير الموضوعة في قائمة الانتظار أو التي تتم معالجتها فقط',
  'Only suspended referral programs can be resumed':
    'يمكن استئناف برامج الإحالة المعلقة فقط',
  'Only suspended students can be reactivated':
    'يمكن إعادة تنشيط الطلاب الموقوفين فقط',
  'Only unresolved review candidates can be rejected':
    'يمكن رفض فقط المرشحين للمراجعة الذين لم يتم حلهم',
  'Only unresolved visual candidates can be updated':
    'يمكن فقط تحديث المرشحين المرئيين الذين لم يتم حلهم',
  'Option media must reference an existing zero-based option index':
    'يجب أن تشير وسائط الخيارات إلى فهرس خيار قائم على الصفر',
  'Order cannot accept an initial payment proof':
    'لا يمكن للطلب قبول إثبات الدفع الأولي',
  'Order cannot be cancelled': 'لا يمكن إلغاء الطلب',
  'Order cannot be fulfilled': 'لا يمكن تنفيذ الطلب',
  'Order cannot start an XPay payment': 'لا يمكن للطلب بدء دفعة XPay',
  'Order not found': 'لم يتم العثور على الطلب',
  'PAYMENT entitlements can only be created by payment approval':
    'لا يمكن إنشاء استحقاقات الدفع إلا من خلال الموافقة على الدفع',
  'PDF transcription is not configured': 'لم يتم تكوين النسخ PDF',
  'PDF transcription page not found': 'لم يتم العثور على صفحة النسخ بتنسيق PDF',
  'Page transcription retry is available only for PDF imports':
    'تتوفر إعادة محاولة نسخ الصفحة فقط لعمليات استيراد PDF',
  'Partner ledger reporting is disabled by rollout control':
    'تم تعطيل تقارير دفتر أستاذ الشريك عن طريق التحكم في الطرح',
  'Partner must be a CONTENT_PUBLISHER': 'يجب أن يكون الشريك CONTENT_PUBLISHER',
  'Partner must be a REFERRAL_PARTNER': 'يجب أن يكون الشريك REFERRAL_PARTNER',
  'Partner reporting is not available for this account':
    'تقارير الشركاء غير متاحة لهذا الحساب',
  'Partner settlement not found': 'لم يتم العثور على تسوية الشريك',
  'Password change required': 'تغيير كلمة المرور مطلوب',
  'Payment proof asset has already been submitted':
    'لقد تم بالفعل إرسال أصل إثبات الدفع',
  'Payment proof must be a ready asset uploaded by the student':
    'يجب أن يكون إثبات الدفع أصلًا جاهزًا تم تحميله بواسطة الطالب',
  'Payment proofs cannot be content attachments':
    'لا يمكن أن تكون إثباتات الدفع مرفقة بالمحتوى',
  'Payment proofs must use the student payment endpoint':
    'يجب أن تستخدم إثباتات الدفع نقطة نهاية دفع الطالب',
  'Payment submission cannot be approved': 'لا يمكن الموافقة على إرسال الدفع',
  'Payment submission cannot be rejected': 'لا يمكن رفض تقديم الدفع',
  'Payment submission is not eligible for resubmission':
    'إرسال الدفعة غير مؤهل لإعادة التقديم',
  'Payment submission not found': 'لم يتم العثور على إرسال الدفع',
  'Percentage agreements require revenueShareBps':
    'تتطلب اتفاقيات النسبة المئوية إيرادات ShareBps',
  'Percentage cannot exceed 100%': 'لا يمكن أن تتجاوز النسبة 100%',
  'Percentage rules require percentageBps':
    'تتطلب قواعد النسبة المئوية نسبة مئوية في الثانية',
  'Placement anchor must be START, END, or AFTER:<source block key>':
    'يجب أن يكون مرساة الموضع START، أو END، أو بعد: <مفتاح كتلة المصدر>',
  'Primary agreement overlaps an active primary agreement for this target':
    'تتداخل الاتفاقية الأساسية مع اتفاقية أساسية نشطة لهذا الهدف',
  'Provide every payment method exactly once':
    'قم بتوفير كل طريقة دفع مرة واحدة بالضبط',
  'Provide exactly one courseId or chapterId':
    'قم بتوفير معرف دورة تدريبية أو معرف فصل واحد بالضبط',
  'Provide exactly one courseId, chapterId, or lessonId':
    'قم بتوفير معرف دورة تدريبية أو معرف فصل أو معرف درس واحد بالضبط',
  'Provide exactly one of rawText or sourceAssetId':
    'قم بتوفير واحد بالضبط من النص الخام أو sourceAssetId',
  'Provide exactly one of subjectId, entitlementId, or orderItemId':
    'أدخل واحدًا بالضبط من subjectId، أو entitlementId، أو orderItemId',
  'Provide exactly one practice scope': 'توفير نطاق ممارسة واحد بالضبط',
  'Provide title or content': 'توفير العنوان أو المحتوى',
  'Publication state changed; retry': 'تم تغيير حالة النشر؛ أعد المحاولة',
  'Published chapter not found': 'لم يتم العثور على الفصل المنشور',
  'Published course not found': 'لم يتم العثور على الدورة التدريبية المنشورة',
  'Published hierarchy record not found':
    'لم يتم العثور على سجل التسلسل الهرمي المنشور',
  'Published lesson not found': 'لم يتم العثور على الدرس المنشور',
  'Published or archived questions cannot be edited':
    'لا يمكن تحرير الأسئلة المنشورة أو المؤرشفة',
  'Published subject not found': 'لم يتم العثور على الموضوع المنشور',
  'Publisher agreement not found': 'لم يتم العثور على اتفاقية الناشر',
  'Purchasable chapter not found': 'لم يتم العثور على الفصل القابل للشراء',
  'Purchasable course not found':
    'لم يتم العثور على الدورة التدريبية القابلة للشراء',
  'Purchasable pricing requires an EGP priceMinor':
    'يتطلب التسعير القابل للشراء سعرًا بالجنيه المصري طفيفًا',
  'Question attachment not found': 'لم يتم العثور على مرفق السؤال',
  'Question attachments must be ready compatible assets':
    'يجب أن تكون مرفقات الأسئلة أصولًا متوافقة جاهزة',
  'Question bank is not accessible': 'بنك الأسئلة لا يمكن الوصول إليه',
  'Question bank subject cannot change after questions are attached':
    'لا يمكن تغيير موضوع بنك الأسئلة بعد إرفاق الأسئلة',
  'Question body, explanation, and positive maxPoints are required':
    'مطلوب نص السؤال والشرح والحد الأقصى الإيجابي',
  'Question changed after this AI run; generate a new run':
    'تغير السؤال بعد تشغيل الذكاء الاصطناعي هذا؛ إنشاء تشغيل جديد',
  'Question context not found': 'لم يتم العثور على سياق السؤال',
  'Question course ancestry must be published': 'يجب نشر أصل السؤال بالطبع',
  'Question course subject must match the question bank subject':
    'يجب أن يتطابق موضوع مقرر الأسئلة مع موضوع بنك الأسئلة',
  'Question drill-down ranges are limited to 93 days; use aggregate usage trends for longer ranges':
    'نطاقات التنقل لأسفل للأسئلة محدودة بـ 93 يومًا؛ استخدام اتجاهات الاستخدام الإجمالية لنطاقات أطول',
  'Question explanation is stale and must be regenerated or reviewed':
    'شرح السؤال قديم ويجب إعادة إنشائه أو مراجعته',
  'Question highlight not found': 'لم يتم العثور على تمييز السؤال',
  'Question import child not found': 'لم يتم العثور على طفل استيراد السؤال',
  'Question import chunk not found': 'لم يتم العثور على قطعة استيراد السؤال',
  'Question import item not found': 'لم يتم العثور على عنصر استيراد السؤال',
  'Question import media not found': 'لم يتم العثور على وسائط استيراد السؤال',
  'Question import not found': 'لم يتم العثور على استيراد السؤال',
  'Question import queue is unavailable; the chunk can be retried':
    'قائمة انتظار استيراد الأسئلة غير متوفرة؛ يمكن إعادة محاولة القطعة',
  'Question import queue is unavailable; the import can be retried':
    'قائمة انتظار استيراد الأسئلة غير متوفرة؛ يمكن إعادة محاولة الاستيراد',
  'Question import queue is unavailable; the page can be retried':
    'قائمة انتظار استيراد الأسئلة غير متوفرة؛ يمكن إعادة محاولة الصفحة',
  'Question imports support TXT and PDF assets only. Export DOCX files to PDF first.':
    'تدعم عمليات استيراد الأسئلة أصول TXT وPDF فقط. قم بتصدير ملفات DOCX إلى PDF أولاً.',
  'Question is already archived': 'تم أرشفة السؤال بالفعل',
  'Question is not accessible': 'السؤال لا يمكن الوصول إليه',
  'Question media must use ownerReference QUESTION':
    'يجب أن تستخدم وسائط السؤال OwnerReference QUESTION',
  'Question option not found': 'لم يتم العثور على خيار السؤال',
  'Question options do not satisfy its answer type':
    'خيارات السؤال لا تناسب نوع إجابته',
  'Question placement cannot be resolved for analytics':
    'لا يمكن حل موضع السؤال للتحليلات',
  'Question placements must be unique': 'يجب أن تكون مواضع الأسئلة فريدة',
  'Question report not found': 'لم يتم العثور على تقرير السؤال',
  'Question requires a placement': 'السؤال يحتاج إلى موضع',
  'Question scope can be changed only while draft or rejected':
    'لا يمكن تغيير نطاق السؤال إلا أثناء صياغته أو رفضه',
  'Question source and bank must be published': 'يجب نشر مصدر السؤال والبنك',
  'Question video must be ready': 'فيديو السؤال يجب أن يكون جاهزا',
  'Question video timestamp is outside the video duration':
    'الطابع الزمني لفيديو السؤال خارج مدة الفيديو',
  'Question-usage ranges are limited to 93 days':
    'تقتصر نطاقات استخدام الأسئلة على 93 يومًا',
  'Raw XPay webhook body is unavailable': 'نص خطاف الويب Raw XPay غير متاح',
  'Reconciliation run is already running': 'تشغيل التسوية قيد التشغيل بالفعل',
  'Reconciliation run not found': 'لم يتم العثور على تشغيل المصالحة',
  'Reconciliation runs require explicitly selected approved orders':
    'تتطلب عمليات التسوية أوامر معتمدة محددة بشكل واضح',
  'Referenced assets cannot be archived': 'لا يمكن أرشفة الأصول المشار إليها',
  'Referenced assets cannot be deleted': 'لا يمكن حذف الأصول المشار إليها',
  'Referenced context cannot be deleted': 'لا يمكن حذف السياق المشار إليه',
  'Referenced source or bank cannot be deleted':
    'لا يمكن حذف المصدر أو البنك المشار إليه',
  'Referenced video assets cannot be archived':
    'لا يمكن أرشفة أصول الفيديو المشار إليها',
  'Referenced video assets cannot be deleted':
    'لا يمكن حذف أصول الفيديو المشار إليها',
  'Referral activation is disabled by rollout control':
    'تم تعطيل تنشيط الإحالة عن طريق التحكم في الطرح',
  'Referral attribution not found': 'لم يتم العثور على إسناد الإحالة',
  'Referral code already exists': 'رمز الإحالة موجود بالفعل',
  'Referral code has no active commission rule':
    'لا يحتوي رمز الإحالة على قاعدة عمولة نشطة',
  'Referral code is not eligible': 'رمز الإحالة غير مؤهل',
  'Referral code is not eligible for this cart':
    'رمز الإحالة غير مؤهل لهذه العربة',
  'Referral code must contain at least two characters':
    'يجب أن يحتوي رمز الإحالة على حرفين على الأقل',
  'Referral code not found': 'لم يتم العثور على رمز الإحالة',
  'Referral code requires fraud review before checkout':
    'يتطلب رمز الإحالة مراجعة الاحتيال قبل الخروج',
  'Referral code usage limit has been reached':
    'تم الوصول إلى حد استخدام رمز الإحالة',
  'Referral codes are not enabled for this account':
    'رموز الإحالة غير ممكّنة لهذا الحساب',
  'Referral commission rule not found': 'لم يتم العثور على قاعدة عمولة الإحالة',
  'Referral coverage target not found': 'لم يتم العثور على هدف تغطية الإحالة',
  'Referral program not found': 'لم يتم العثور على برنامج الإحالة',
  'Referral reporting is not available for this partner':
    'تقارير الإحالة غير متاحة لهذا الشريك',
  'Referral review flag is already resolved':
    'تم بالفعل حل علامة مراجعة الإحالة',
  'Referral review flag not found': 'لم يتم العثور على علامة مراجعة الإحالة',
  'Referral review rule not found': 'لم يتم العثور على قاعدة مراجعة الإحالة',
  'Refund operations require an active database refund policy':
    'تتطلب عمليات الاسترداد سياسة استرداد نشطة لقاعدة البيانات',
  'Refund request not found': 'لم يتم العثور على طلب استرداد الأموال',
  'Remove the video outline before changing this item to a non-video type':
    'قم بإزالة مخطط الفيديو قبل تغيير هذا العنصر إلى نوع غير فيديو',
  'Reorder items must contain each sibling once with sortOrder values 1 through N.':
    'يجب أن تحتوي عناصر إعادة الترتيب على كل شقيق مرة واحدة بقيم الترتيب من 1 إلى N.',
  'Reorder must include every sibling in this scope.':
    'يجب أن تشمل إعادة الترتيب كل شقيق في هذا النطاق.',
  'Replacement cannot start before the agreement it supersedes':
    'لا يمكن أن يبدأ الاستبدال قبل أن تحل الاتفاقية محلها',
  'Report exports are disabled by rollout control':
    'تم تعطيل عمليات تصدير التقارير عن طريق التحكم في الطرح',
  'Resolved flags cannot receive new notes':
    'لا يمكن للعلامات التي تم حلها تلقي ملاحظات جديدة',
  'Response shape does not match question type':
    'شكل الرد لا يتطابق مع نوع السؤال',
  'Review candidate has no retained extraction source':
    'لا يوجد لدى مرشح المراجعة مصدر استخراج محتفظ به',
  'Review candidate source is unavailable': 'مراجعة مصدر المرشح غير متاح',
  'Scope subject cannot be resolved': 'لا يمكن حل موضوع النطاق',
  'Scoped programs require exactly one courseId or chapterId':
    'تتطلب البرامج ذات النطاق المحدد معرف دورة تدريبية أو معرف فصل واحد بالضبط',
  'Scopes must be unique': 'يجب أن تكون النطاقات فريدة',
  'Screenshot alt text is required with a review screenshot':
    'مطلوب نص بديل للقطة الشاشة مع لقطة شاشة للمراجعة',
  'Screenshot alt text requires a review screenshot':
    'يتطلب النص البديل للقطة الشاشة لقطة شاشة للمراجعة',
  'Select an answer and/or explanation to apply':
    'حدد إجابة و/أو شرحًا لتطبيقه',
  'Select at least one course or chapter, or apply to all products':
    'قم باختيار دورة أو فصل واحد على الأقل، أو قم بالتطبيق على جميع المنتجات',
  'Select at least one course, chapter, lesson, or section':
    'حدد دورة أو فصلاً أو درسًا أو قسمًا واحدًا على الأقل',
  'Selected child is unavailable': 'الطفل المحدد غير متاح',
  'Selected options do not belong to the question':
    'الخيارات المحددة لا تنتمي إلى السؤال',
  'Selected questions must have at least 20 community responses':
    'يجب أن تحتوي الأسئلة المحددة على 20 إجابة من المجتمع على الأقل',
  'Self-referral is not allowed': 'الإحالة الذاتية غير مسموح بها',
  'Settlement is already marked paid':
    'تم بالفعل وضع علامة على التسوية بأنها مدفوعة',
  'Short and fill-in questions require accepted answers':
    'تتطلب الأسئلة القصيرة والملء إجابات مقبولة',
  'Sibling ordering is invalid': 'ترتيب الأخوة غير صالح',
  'Single-choice questions accept at most one option':
    'تقبل الأسئلة ذات الاختيار الواحد خيارًا واحدًا على الأكثر',
  'Single-choice questions require exactly one option':
    'تتطلب أسئلة الاختيار الواحد خيارًا واحدًا بالضبط',
  'Slug already in use in the target chapter; rename before moving':
    'البزاقة المستخدمة بالفعل في الفصل المستهدف؛ إعادة تسمية قبل التحرك',
  'Slug already in use in the target course; rename before moving':
    'البزاقة المستخدمة بالفعل في الدورة المستهدفة؛ إعادة تسمية قبل التحرك',
  'Slug already in use in the target lesson; rename before moving':
    'البزاقة المستخدمة بالفعل في الدرس المستهدف؛ إعادة تسمية قبل التحرك',
  'Slug already in use in the target subject; rename before moving':
    'سبيكة مستخدمة بالفعل في الموضوع المستهدف؛ إعادة تسمية قبل التحرك',
  'Slug already in use within this chapter':
    'سبيكة مستخدمة بالفعل في هذا الفصل',
  'Slug already in use within this course':
    'سبيكة قيد الاستخدام بالفعل في هذه الدورة',
  'Slug already in use within this lesson': 'سبيكة مستخدمة بالفعل في هذا الدرس',
  'Slug already in use within this subject':
    'سبيكة قيد الاستخدام بالفعل في هذا الموضوع',
  'Source asset must be a ready PDF or TXT asset. Export DOCX files to PDF first.':
    'يجب أن يكون الأصل المصدر أصلًا جاهزًا بتنسيق PDF أو TXT. قم بتصدير ملفات DOCX إلى PDF أولاً.',
  'Source text can be changed only for a review-required import with no created items':
    'يمكن تغيير النص المصدر فقط للاستيراد المطلوب للمراجعة دون أي عناصر تم إنشاؤها',
  'Source text is too short': 'النص المصدر قصير جدًا',
  'Speech-to-text request failed': 'فشل طلب تحويل الكلام إلى نص',
  'Speech-to-text returned no transcript':
    'لم تُرجع ميزة تحويل الكلام إلى نص أي نص',
  'Structured explanation must contain all six explanation sections':
    'يجب أن يحتوي الشرح المنظم على أقسام الشرح الستة جميعها',
  'Student academic grade is required': 'يشترط الدرجة الأكاديمية للطالب',
  'Student academic grade must be published':
    'يجب نشر الدرجة الأكاديمية للطالب',
  'Student authentication is required': 'مطلوب مصادقة الطالب',
  'Student is already deleted': 'تم حذف الطالب بالفعل',
  'Student is not linked to this parent': 'الطالب غير مرتبط بهذا الوالد',
  'Student state changed; try again': 'تغيرت حالة الطالب؛ حاول مرة أخرى',
  'Subject constant not found': 'لم يتم العثور على ثابت الموضوع',
  'TEXT content requires a non-empty textBody':
    'يتطلب محتوى النص نصًا غير فارغ',
  'Table block is too large': 'كتلة الجدول كبيرة جدًا',
  'Table blocks require a rectangular cell matrix and headerRow':
    'تتطلب كتل الجدول مصفوفة خلايا مستطيلة وصف رأس',
  'Target sortOrder is outside the sibling scope':
    'ترتيب الفرز المستهدف يقع خارج نطاق الأخوة',
  'Testimonial not found': 'لم يتم العثور على شهادة',
  'Testimonial screenshot not found': 'لم يتم العثور على لقطة شاشة للشهادة',
  'Testimonial screenshots must use an IMAGE asset':
    'يجب أن تستخدم لقطات الشاشة التزكية أصل IMAGE',
  'Text blocks require text': 'تتطلب كتل النص النص',
  'Text extraction produced too little readable text; export the source to PDF or paste the text':
    'أنتج استخراج النص القليل جدًا من النص القابل للقراءة؛ تصدير المصدر إلى PDF أو لصق النص',
  'Text extraction quality is too low; export the source to PDF or paste the text':
    'جودة استخراج النص منخفضة جدًا؛ تصدير المصدر إلى PDF أو لصق النص',
  'The requested Student 360 section is not permitted':
    'قسم الطالب 360 المطلوب غير مسموح به',
  'The super admin account cannot be targeted by this endpoint':
    'لا يمكن استهداف حساب المشرف المتميز بواسطة نقطة النهاية هذه',
  'The supplied support reason is not approved by policy':
    'سبب الدعم المقدم لم تتم الموافقة عليه بواسطة السياسة',
  'This role cannot request the selected report':
    'لا يمكن لهذا الدور أن يطلب التقرير المحدد',
  'Title must contain at least one letter or number when no slug is provided.':
    'يجب أن يحتوي العنوان على حرف أو رقم واحد على الأقل في حالة عدم توفير سبيكة ثابتة.',
  'Title must not be blank': 'يجب ألا يكون العنوان فارغًا',
  'Unsupported MIME type for asset kind': 'نوع MIME غير مدعوم لنوع الأصل',
  'Unsupported asset kind': 'نوع الأصول غير معتمد',
  'Unsupported audio format': 'تنسيق الصوت غير مدعوم',
  'Unsupported catalog resource': 'مورد الكتالوج غير معتمد',
  'Unsupported cover resource': 'مورد الغلاف غير معتمد',
  'Unsupported publisher payout kind': 'نوع دفع الناشر غير مدعوم',
  'Unsupported report type': 'نوع التقرير غير مدعوم',
  'Uploaded MIME type does not match authorization':
    'نوع MIME الذي تم تحميله لا يتطابق مع التفويض',
  'Usage-rollup rebuilds must cover an inclusive range of at most 367 days':
    'يجب أن تغطي عمليات إعادة إنشاء مجموعة الاستخدام نطاقًا شاملاً يصل إلى 367 يومًا على الأكثر',
  'Use academicGradeIds to change a shared subject’s grade assignments':
    'استخدم معرفات الدرجات الأكاديمية لتغيير تعيينات درجات المادة المشتركة',
  'Use at most one placement target filter':
    'استخدم فلترًا واحدًا لاستهداف المواضع على الأكثر',
  'Use reorder to change position within the same parent':
    'استخدم إعادة الترتيب لتغيير الموضع داخل نفس الأصل',
  'Use the video asset endpoint for videos':
    'استخدم نقطة نهاية أصول الفيديو لمقاطع الفيديو',
  'Use the video asset endpoints to manage video assets':
    'استخدم نقاط نهاية أصول الفيديو لإدارة أصول الفيديو',
  'Video asset not found': 'لم يتم العثور على أصول الفيديو',
  'Video cannot be uploaded in its current state':
    'لا يمكن تحميل الفيديو في حالته الحالية',
  'Video is not ready': 'الفيديو غير جاهز',
  'Video is already assigned to a content item':
    'الفيديو مرتبط بالفعل بعنصر محتوى آخر',
  'Published video content item not found':
    'لم يتم العثور على عنصر محتوى منشور للفيديو',
  'Video must be ready': 'يجب أن يكون الفيديو جاهزا',
  'Video outline concept titles cannot be blank':
    'لا يمكن أن تكون عناوين مفهوم المخطط التفصيلي للفيديو فارغة',
  'Video outline endSeconds must be greater than startSeconds':
    'يجب أن تكون قيمة endSeconds لمخطط الفيديو أكبر من قيمة startSeconds',
  'Video outline timestamps must not exceed the video duration':
    'يجب ألا تتجاوز الطوابع الزمنية لمخطط الفيديو مدة الفيديو',
  'Video outline topic titles cannot be blank':
    'لا يمكن أن تكون عناوين مواضيع المخطط التفصيلي للفيديو فارغة',
  'Video outlines can only be attached to VIDEO content items':
    'لا يمكن إرفاق مخططات الفيديو إلا بعناصر محتوى الفيديو',
  'Video processing must complete before publication':
    'يجب أن تكتمل معالجة الفيديو قبل النشر',
  'Video timestamp is outside the video duration':
    'الطابع الزمني للفيديو خارج مدة الفيديو',
  'Video upload has not started': 'لم يبدأ تحميل الفيديو',
  'Visual media is available only for root PDF imports':
    'تتوفر الوسائط المرئية فقط لعمليات استيراد ملف PDF الجذري',
  'Visual ownership review is available only for PDF visual imports':
    'مراجعة الملكية المرئية متاحة فقط لعمليات استيراد PDF المرئية',
  'Written candidates require one or more accepted answers':
    'يتطلب المرشحون الكتابيون إجابة واحدة أو أكثر من الإجابات المقبولة',
  'Written questions cannot have options':
    'لا يمكن أن تحتوي الأسئلة المكتوبة على خيارات',
  'XPay could not create a checkout session': 'تعذر على XPay إنشاء جلسة دفع',
  'XPay is not configured': 'لم يتم تكوين XPay',
  'XPay order not found': 'لم يتم العثور على طلب XPay',
  'XPay payment amount does not match order':
    'مبلغ الدفع XPay لا يتطابق مع الطلب',
  'XPay payment attempt not found': 'لم يتم العثور على محاولة دفع XPay',
  'assetId is required': 'معرف الأصل مطلوب',
  'assetIds must contain every attachment exactly once':
    'يجب أن تحتوي معرفات الأصول على كل مرفق مرة واحدة بالضبط',
  'chapter not found': 'لم يتم العثور على الفصل',
  'contextIds must be unique': 'يجب أن تكون معرفات السياق فريدة',
  'durationSeconds is required when isTimed is true':
    'مطلوبة DurationSeconds عندما تكون قيمة isTimed صحيحة',
  'endsAt must be after startsAt': 'يجب أن يكون endAt بعد startAt',
  'expiresAt must be after startsAt':
    'يجب أن يكون انتهاء الصلاحية بعد بدء التشغيل',
  'from must be on or before to': 'من يجب أن يكون في أو قبل ل',
  'language must be an ISO language code': 'يجب أن تكون اللغة رمز لغة ISO',
  'lesson not found': 'لم يتم العثور على الدرس',
  'optionIds must contain every option exactly once':
    'يجب أن تحتوي معرفات الخيار على كل خيار مرة واحدة بالضبط',
  'optionIds must not contain duplicates':
    'يجب ألا تحتوي معرفات الخيار على نسخ مكررة',
  'pageNumber must be a positive integer':
    'يجب أن يكون رقم الصفحة عددًا صحيحًا موجبًا',
  'placement must include exactly one hierarchy target':
    'يجب أن يتضمن الموضع هدفًا هرميًا واحدًا بالضبط',
  'publisherUserId is allowed only for CONTENT_PUBLISHER sources':
    'PublisherUserId مسموح به فقط لمصادر CONTENT_PUBLISHER',
  'publisherUserId must reference a CONTENT_PUBLISHER partner':
    'يجب أن يشير PublisherUserId إلى شريك CONTENT_PUBLISHER',
  'q and search must contain the same value when both are supplied':
    'q وsearch يجب أن يحتويا على نفس القيمة عند توفير كليهما',
  'q must contain searchable text': 'يجب أن يحتوي q على نص قابل للبحث',
  'questionIds must not contain duplicates':
    'يجب ألا تحتوي معرفات الأسئلة على تكرارات',
  'scopes is required': 'النطاقات مطلوبة',
  'section not found': 'لم يتم العثور على القسم',
  'selectedOptionIds must not contain duplicates':
    'يجب ألا تحتوي المحددات المختارة على نسخ مكررة',
  'targetType must be COURSE or CHAPTER':
    'يجب أن يكون targetType عبارة عن COURSE أو CHAPTER',
  'title is required': 'العنوان مطلوب',
  'title must not be blank': 'يجب ألا يكون العنوان فارغًا',
  'transactionReference must not exceed 200 characters':
    'يجب ألا يتجاوز مرجع المعاملة 200 حرف',
  'types must be a comma-separated subset of CHAPTER, LESSON, SECTION':
    'يجب أن تكون الأنواع مجموعة فرعية مفصولة بفواصل من الفصل والدرس والقسم',
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
    ar: translations[message] ?? untranslatedMessage(message, statusCode),
  };
}

/**
 * Do not replace an unknown message with a generic HTTP-status sentence.
 *
 * A generic Arabic fallback made unrelated errors indistinguishable to an
 * Arabic-speaking user. Until a message receives a reviewed Arabic
 * translation, retain the precise source-language detail after a clear Arabic
 * label. This is intentionally a visible translation-coverage gap, rather
 * than a misleading translation that loses the corrective action.
 */
function untranslatedMessage(message: string, statusCode: number): string {
  const dynamic = dynamicArabicMessage(message);
  if (dynamic) return dynamic;
  const title = statusTitles[statusCode]?.ar ?? 'خطأ';
  return `${title}: ${message}`;
}

/** Translates message families whose runtime detail is intentionally dynamic. */
function dynamicArabicMessage(message: string): string | undefined {
  const placementNotFound =
    /^Placement (?:courseId|chapterId|lessonId|sectionId) not found$/.exec(
      message,
    );
  if (placementNotFound) return 'لم يتم العثور على موضع المحتوى';

  const scopeNotFound =
    /^Scope (courseId|chapterId|lessonId|sectionId) not found$/.exec(message);
  if (scopeNotFound) {
    const scopes: Record<string, string> = {
      courseId: 'المادة الدراسية',
      chapterId: 'الفصل',
      lessonId: 'الدرس',
      sectionId: 'القسم',
    };
    return `لم يتم العثور على نطاق ${scopes[scopeNotFound[1]]}`;
  }

  const notFound = /^(.+) not found$/.exec(message);
  if (notFound) {
    const resource = notFound[1].toLowerCase();
    const resources: Record<string, string> = {
      scope: 'النطاق',
      placement: 'موضع المحتوى',
      academicgrade: 'الصف الدراسي',
      'content item': 'عنصر المحتوى',
      contentitem: 'عنصر المحتوى',
      course: 'المادة الدراسية',
      chapter: 'الفصل',
      lesson: 'الدرس',
      section: 'القسم',
      courseid: 'المادة الدراسية',
      chapterid: 'الفصل',
      lessonid: 'الدرس',
      sectionid: 'القسم',
    };
    return `لم يتم العثور على ${resources[resource] ?? notFound[1]}`;
  }

  const contentBlocks = /^Content cannot contain more than (\d+) blocks$/.exec(
    message,
  );
  if (contentBlocks)
    return `لا يمكن أن يحتوي المحتوى على أكثر من ${contentBlocks[1]} كتل`;

  const unsupportedFilters = /^Unsupported filters for this report: (.+)$/.exec(
    message,
  );
  if (unsupportedFilters)
    return `عوامل التصفية غير المدعومة لهذا التقرير: ${unsupportedFilters[1]}`;

  const exportLimit =
    /^Export exceeds the (.+) row limit; narrow the filters$/.exec(message);
  if (exportLimit)
    return `يتجاوز التصدير حد ${exportLimit[1]} صف. قلل عوامل التصفية ثم أعد المحاولة`;

  const pdfLimit =
    /^PDF has (\d+) pages; the configured maximum is (\d+)$/.exec(message);
  if (pdfLimit)
    return `يتكون ملف PDF من ${pdfLimit[1]} صفحة، بينما الحد الأقصى المسموح هو ${pdfLimit[2]} صفحة`;
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
