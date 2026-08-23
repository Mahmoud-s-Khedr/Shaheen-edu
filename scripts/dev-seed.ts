/*
 * Development-only API seeder.  Deliberately uses the public HTTP surface rather
 * than Prisma so it doubles as a positive-path smoke test.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ApiClient } from './journeys/lib/api-client.js';
import {
  fetchDeliveryUrl,
  getDeliveryFetches,
  resetDeliveryFetches,
} from './journeys/lib/delivery.js';
import { redact } from './journeys/lib/redaction.js';

type Json = Record<string, any>;
type State = {
  id: string;
  disposition: 'created' | 'reused';
  [key: string]: unknown;
};

const MARK = '[dev-seed]';
const fixture = {
  admin: 'dev-seed-admin@example.test',
  publisher: 'dev-seed-publisher@example.test',
  referral: 'dev-seed-referral@example.test',
  parentPhone: '+201000000901',
  students: [
    {
      key: 'learner-a',
      fullName: `${MARK} الطالب الأول`,
      phone: '+201000000911',
      nationalId: '29901010000011',
    },
    {
      key: 'learner-b',
      fullName: `${MARK} الطالب الثاني`,
      phone: '+201000000912',
      nationalId: '29901010000012',
    },
    {
      key: 'commerce',
      fullName: `${MARK} طالب التجارة`,
      phone: '+201000000913',
      nationalId: '29901010000013',
    },
    {
      key: 'retained',
      fullName: `${MARK} طالب الاحتفاظ`,
      phone: '+201000000914',
      nationalId: '29901010000014',
    },
  ],
  slugs: {
    grade: 'dev-seed-grade-10',
    subject: 'dev-seed-mathematics',
    paid: 'dev-seed-algebra',
    public: 'dev-seed-public-revision',
    chapter: 'dev-seed-equations',
    lesson: 'dev-seed-linear-equations',
    section: 'dev-seed-basics',
    archived: 'dev-seed-retained-course',
  },
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function pause(ms: number) {
  return new Promise<void>((done) => setTimeout(done, ms));
}

function environment() {
  if (process.env.DEV_SEED_ALLOW_MUTATIONS !== 'true')
    throw new Error('Refusing to run: set DEV_SEED_ALLOW_MUTATIONS=true');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to run with NODE_ENV=production');
  const baseUrl = required('DEV_SEED_BASE_URL').replace(/\/$/, '');
  const host = new URL(baseUrl).hostname.toLowerCase();
  if (/(^|\.)(prod|production)(\.|$)|\.(com|net|org)$/.test(host))
    throw new Error(`Refusing production-like target host: ${host}`);
  const local = new Set(['localhost', '127.0.0.1', '::1']);
  if (
    !local.has(host) &&
    !(
      process.env.DEV_SEED_TARGET === 'staging' &&
      process.env.DEV_SEED_CONFIRM_STAGING_MUTATIONS === 'true'
    )
  )
    throw new Error(
      'Non-local targets require DEV_SEED_TARGET=staging and DEV_SEED_CONFIRM_STAGING_MUTATIONS=true',
    );
  const webhook = required('DEV_SEED_BUNNY_WEBHOOK_URL');
  if (
    process.env.DEV_SEED_BUNNY_STORAGE_CONFIGURED !== 'true' ||
    process.env.DEV_SEED_BUNNY_STREAM_CONFIGURED !== 'true'
  )
    throw new Error(
      'Refusing to run: confirm Bunny Storage and Stream are configured on the development API',
    );
  assert(
    new URL(webhook).protocol === 'https:',
    'DEV_SEED_BUNNY_WEBHOOK_URL must be HTTPS',
  );
  return {
    baseUrl,
    apiPrefix: (process.env.DEV_SEED_API_PREFIX ?? '/api/v1').replace(
      /\/$/,
      '',
    ),
    timeoutMs: Number(process.env.DEV_SEED_REQUEST_TIMEOUT_MS ?? '30000'),
    superEmail: required('DEV_SEED_SUPER_ADMIN_EMAIL'),
    superPassword: required('DEV_SEED_SUPER_ADMIN_PASSWORD'),
    demoPassword: required('DEV_SEED_DEMO_PASSWORD'),
    webhook,
    videoTimeout: Number(
      process.env.DEV_SEED_VIDEO_READY_TIMEOUT_MS ?? '600000',
    ),
    videoPoll: Number(process.env.DEV_SEED_VIDEO_POLL_INTERVAL_MS ?? '5000'),
  };
}

class Seed {
  private readonly env = environment();
  private readonly operations: Json[] = [];
  private readonly states: Record<string, State> = {};
  private readonly checks: Json[] = [];
  private readonly api = new ApiClient(
    this.env,
    'dev-seed',
    (id) => this.currentCorrelations.push(id),
    (op) => this.operations.push({ ...op, body: undefined }),
  );
  private readonly publicApi = new ApiClient(
    this.env,
    'dev-seed-public',
    (id) => this.currentCorrelations.push(id),
    (op) => this.operations.push({ ...op, body: undefined }),
  );
  private currentCorrelations: string[] = [];

  private async call<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    expected: number | number[] = [200, 201],
  ) {
    return this.api.request<T>(method, path, body, { expected });
  }
  private async publicCall<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    token?: string,
    expected: number | number[] = [200, 201],
  ) {
    return this.publicApi.request<T>(method, path, body, {
      accessToken: token,
      expected,
    });
  }
  private record(key: string, item: any, disposition: 'created' | 'reused') {
    assert(item?.id, `Missing id for ${key}`);
    this.states[key] = { id: item.id, disposition };
    return item;
  }
  private async step(name: string, action: () => Promise<void>) {
    const started = performance.now();
    this.currentCorrelations = [];
    try {
      await action();
      this.checks.push({
        name,
        status: 'passed',
        durationMs: Math.round(performance.now() - started),
        correlationIds: this.currentCorrelations,
      });
      console.log(`dev-seed: ${name}... PASS`);
    } catch (error) {
      this.checks.push({
        name,
        status: 'failed',
        durationMs: Math.round(performance.now() - started),
        correlationIds: this.currentCorrelations,
        error: redact(
          error instanceof Error ? { message: error.message } : error,
        ),
      });
      throw error;
    }
  }
  private async page(path: string): Promise<any[]> {
    const response = await this.call<any>(
      'GET',
      path.includes('?') ? `${path}&limit=100` : `${path}?limit=100`,
    );
    return response.body.data ?? response.body;
  }
  private async publish(resource: string, item: any) {
    if (item.status === 'ARCHIVED')
      item = (
        await this.call<any>('POST', `/admin/${resource}/${item.id}/restore`)
      ).body;
    if (item.status === 'DRAFT')
      return (
        await this.call<any>('POST', `/admin/${resource}/${item.id}/publish`)
      ).body;
    return item;
  }

  private async login() {
    const health = await fetch(`${this.env.baseUrl}/health`);
    assert(health.ok, `API health check failed with ${health.status}`);
    const response = await this.call<any>('POST', '/auth/admins/login', {
      email: this.env.superEmail,
      password: this.env.superPassword,
    });
    this.api.accessToken = response.body.accessToken;
  }
  private async findOrCreate(
    key: string,
    listPath: string,
    predicate: (item: any) => boolean,
    path: string,
    body: unknown,
  ) {
    const found = (await this.page(listPath)).find(predicate);
    return this.record(
      key,
      found ?? (await this.call<any>('POST', path, body)).body,
      found ? 'reused' : 'created',
    );
  }

  private async identityAndGeography() {
    const admin = await this.findOrCreate(
      'admin',
      '/admin/admins',
      (x) => x.loginIdentifier === fixture.admin,
      '/admin/admins',
      { email: fixture.admin, password: this.env.demoPassword },
    );
    if (admin.status === 'SUSPENDED')
      await this.call('POST', `/admin/admins/${admin.id}/reactivate`);
    const partners = await this.page('/admin/partners');
    const partner = async (
      key: 'publisher' | 'referral',
      email: string,
      partnerType: string,
    ) => {
      const old = partners.find((x) => x.loginIdentifier === email);
      const item =
        old ??
        (
          await this.call<any>('POST', '/admin/partners', {
            email,
            password: this.env.demoPassword,
            partnerType,
            displayName: `${MARK} ${key}`,
            phone: key === 'publisher' ? '+201000000921' : '+201000000922',
          })
        ).body;
      if (item.status === 'SUSPENDED')
        await this.call('POST', `/admin/partners/${item.id}/reactivate`);
      return this.record(key, item, old ? 'reused' : 'created');
    };
    await partner('publisher', fixture.publisher, 'CONTENT_PUBLISHER');
    await partner('referral', fixture.referral, 'REFERRAL_PARTNER');
    const geography = (
      await this.call<any>('GET', '/admin/geography/governorates')
    ).body as any[];
    const governorate = async (key: string, ar: string, en: string) => {
      const old = geography.find((x) => x.name?.ar === ar);
      return this.record(
        key,
        old ??
          (
            await this.call<any>('POST', '/admin/geography/governorates', {
              ar,
              en,
            })
          ).body,
        old ? 'reused' : 'created',
      );
    };
    const cairo = await governorate('governorate.cairo', `${MARK} القاهرة`, `${MARK} Cairo`);
    const giza = await governorate('governorate.giza', `${MARK} الجيزة`, `${MARK} Giza`);
    const center = async (key: string, gov: any, ar: string, en: string) => {
      const fresh = (
        await this.call<any>('GET', '/admin/geography/governorates')
      ).body as any[];
      const existing = fresh
        .find((x) => x.id === gov.id)
        ?.centers?.find((x: any) => x.name?.ar === ar);
      return this.record(
        key,
        existing ??
          (
            await this.call<any>(
              'POST',
              `/admin/geography/governorates/${gov.id}/centers`,
              { ar, en },
            )
          ).body,
        existing ? 'reused' : 'created',
      );
    };
    await center('center.cairo-a', cairo, `${MARK} مدينة نصر`, `${MARK} Nasr City`);
    await center('center.cairo-b', cairo, `${MARK} المعادي`, `${MARK} Maadi`);
    await center('center.giza-a', giza, `${MARK} الدقي`, `${MARK} Dokki`);
  }

  private async hierarchy() {
    const grade = await this.findOrCreate(
      'grade',
      '/admin/academic-grades',
      (x) => x.slug === fixture.slugs.grade,
      '/admin/academic-grades',
      {
        title: { ar: `${MARK} الصف العاشر`, en: `${MARK} Grade 10` },
        slug: fixture.slugs.grade,
      },
    );
    const subject = await this.findOrCreate(
      'subject',
      `/admin/subjects?academicGradeId=${grade.id}`,
      (x) => x.slug === fixture.slugs.subject,
      '/admin/subjects',
      {
        title: `${MARK} Mathematics`,
        slug: fixture.slugs.subject,
        academicGradeId: grade.id,
      },
    );
    const course = await this.findOrCreate(
      'course.paid',
      `/admin/courses?subjectId=${subject.id}`,
      (x) => x.slug === fixture.slugs.paid,
      '/admin/courses',
      {
        title: `${MARK} Algebra`,
        slug: fixture.slugs.paid,
        subjectId: subject.id,
        accessType: 'PAID',
      },
    );
    const chapter = await this.findOrCreate(
      'chapter',
      `/admin/chapters?courseId=${course.id}`,
      (x) => x.slug === fixture.slugs.chapter,
      '/admin/chapters',
      {
        title: `${MARK} Equations`,
        slug: fixture.slugs.chapter,
        courseId: course.id,
      },
    );
    const lesson = await this.findOrCreate(
      'lesson',
      `/admin/lessons?chapterId=${chapter.id}`,
      (x) => x.slug === fixture.slugs.lesson,
      '/admin/lessons',
      {
        title: `${MARK} Linear equations`,
        slug: fixture.slugs.lesson,
        chapterId: chapter.id,
      },
    );
    const section = await this.findOrCreate(
      'section',
      `/admin/sections?lessonId=${lesson.id}`,
      (x) => x.slug === fixture.slugs.section,
      '/admin/sections',
      {
        title: `${MARK} Basics`,
        slug: fixture.slugs.section,
        lessonId: lesson.id,
      },
    );
    const publicCourse = await this.findOrCreate(
      'course.public',
      `/admin/courses?subjectId=${subject.id}`,
      (x) => x.slug === fixture.slugs.public,
      '/admin/courses',
      {
        title: `${MARK} Public revision`,
        slug: fixture.slugs.public,
        subjectId: subject.id,
        accessType: 'PUBLIC',
      },
    );
    const freeCourse = await this.findOrCreate(
      'course.free',
      `/admin/courses?subjectId=${subject.id}`,
      (x) => x.slug === 'dev-seed-free-practice',
      '/admin/courses',
      {
        title: `${MARK} Free practice`,
        slug: 'dev-seed-free-practice',
        subjectId: subject.id,
        accessType: 'FREE',
      },
    );
    const retainedCandidates = [
      ...(await this.page(`/admin/courses?subjectId=${subject.id}`)),
      ...(await this.page(`/admin/courses?subjectId=${subject.id}&status=ARCHIVED`)),
    ];
    const existingRetained = retainedCandidates.find(
      (item) => item.slug === fixture.slugs.archived,
    );
    const retained = this.record(
      'course.retained',
      existingRetained ??
        (await this.call<any>('POST', '/admin/courses', {
          title: `${MARK} Retained access`,
          slug: fixture.slugs.archived,
          subjectId: subject.id,
          accessType: 'PAID',
        })).body,
      existingRetained ? 'reused' : 'created',
    );
    for (const [resource, item] of [
      ['academic-grades', grade],
      ['subjects', subject],
      ['courses', course],
      ['chapters', chapter],
      ['lessons', lesson],
      ['sections', section],
      ['courses', publicCourse],
      ['courses', freeCourse],
      ['courses', retained],
    ] as const)
      await this.publish(resource, item);
    await this.call('POST', `/admin/pricing/course/${course.id}`, {
      isPurchasable: true,
      priceMinor: 20000,
      currency: 'EGP',
    });
    await this.call('POST', `/admin/pricing/chapter/${chapter.id}`, {
      isPurchasable: true,
      priceMinor: 10000,
      currency: 'EGP',
    });
  }

  private async uploadAssets() {
    const root = resolve(process.cwd(), 'test-files');
    const files = {
      cover: ['G5LDVlJWQAANOhJ.jpg', 'COVER_IMAGE', 'image/jpeg'],
      image: ['G0btsP8XkAAvRbW.jpg', 'IMAGE', 'image/jpeg'],
      pdf: ['1-84628-843-6.pdf', 'PDF', 'application/pdf'],
      document: [
        '01 Research Methodology Methods and Techniques.pdf',
        'DOCUMENT',
        'application/pdf',
      ],
      download: [
        '03_01_data_oriented_design.pdf',
        'DOWNLOADABLE_FILE',
        'application/pdf',
      ],
    } as const;
    const assets = await this.page('/admin/assets');
    for (const [key, [name, kind, contentType]] of Object.entries(files)) {
      const filename = `dev-seed-${key}-${name}`;
      const old = assets.find(
        (x) => x.filename === filename && x.status === 'READY',
      );
      const item =
        old ??
        (
          await this.api.upload<any>(
            `/admin/assets/upload?kind=${kind}`,
            {
              buffer: await readFile(resolve(root, name)),
              filename,
              contentType,
            },
            { expected: 201 },
          )
        ).body;
      this.record(`asset.${key}`, item, old ? 'reused' : 'created');
    }
    const course = this.states['course.paid'];
    await this.call('POST', `/admin/assets/covers/courses/${course.id}`, {
      assetId: this.states['asset.cover'].id,
    });
  }

  private async video() {
    const title = `${MARK} Bunny Stream lesson`;
    const assets = await this.page('/admin/assets');
    let asset = assets.find(
      (x) => x.kind === 'VIDEO' && x.filename === 'dev-seed-video.mp4',
    );
    if (!asset) {
      asset = (
        await this.call<any>('POST', '/admin/video-assets', {
          title,
          filename: 'dev-seed-video.mp4',
        })
      ).body;
      this.record('asset.video', asset, 'created');
    } else this.record('asset.video', asset, 'reused');
    if (asset.status !== 'READY') {
      const authorization = (
        await this.call<any>(
          'POST',
          `/admin/video-assets/${asset.id}/upload-authorization`,
        )
      ).body;
      const bytes = await readFile(
        resolve(
          process.cwd(),
          'test-files',
          'Screencast From 2026-07-24 16-51-21.mp4',
        ),
      );
      const headers = {
        'Tus-Resumable': '1.0.0',
        AuthorizationSignature: authorization.signature,
        AuthorizationExpire: String(authorization.expires),
        LibraryId: String(authorization.libraryId),
        VideoId: authorization.videoId,
      };
      const metadata = `filename ${Buffer.from('dev-seed-video.mp4').toString('base64')},filetype ${Buffer.from('video/mp4').toString('base64')}`;
      const start = await fetch(authorization.endpoint, {
        method: 'POST',
        headers: {
          ...headers,
          'Upload-Length': String(bytes.length),
          'Upload-Metadata': metadata,
        },
      });
      assert(
        start.status === 201,
        `Bunny TUS creation failed with ${start.status}`,
      );
      const location = start.headers.get('location');
      assert(location, 'Bunny TUS creation returned no location');
      const uploaded = await fetch(new URL(location, authorization.endpoint), {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': '0',
          'Content-Length': String(bytes.length),
        },
        body: new Uint8Array(bytes),
      });
      assert(
        uploaded.status === 204,
        `Bunny TUS upload failed with ${uploaded.status}`,
      );
      const deadline = Date.now() + this.env.videoTimeout;
      do {
        await pause(this.env.videoPoll);
        asset = (await this.call<any>('GET', `/admin/video-assets/${asset.id}`))
          .body;
        if (asset.status === 'FAILED')
          throw new Error('Bunny video processing failed');
      } while (asset.status !== 'READY' && Date.now() < deadline);
      assert(
        asset.status === 'READY',
        `Bunny video did not become READY. Verify ${this.env.webhook} is configured in the Stream library.`,
      );
    }
  }

  private async content() {
    const placement = { sectionId: this.states.section.id };
    const items = [
      [
        'text',
        {
          type: 'TEXT',
          title: `${MARK} Text`,
          textBody: 'A complete text lesson.',
          placement,
        },
      ],
      [
        'link',
        {
          type: 'EXTERNAL_LINK',
          title: `${MARK} Link`,
          externalUrl: 'https://example.com/dev-seed',
          placement,
        },
      ],
      ['pdf', { type: 'PDF', title: `${MARK} PDF`, placement }, 'pdf'],
      ['image', { type: 'IMAGE', title: `${MARK} Image`, placement }, 'image'],
      [
        'document',
        { type: 'DOCUMENT', title: `${MARK} Document`, placement },
        'document',
      ],
      [
        'download',
        { type: 'DOWNLOADABLE_FILE', title: `${MARK} Download`, placement },
        'download',
      ],
      ['video', { type: 'VIDEO', title: `${MARK} Video`, placement }, 'video'],
    ] as const;
    for (const [key, payload, assetKey] of items) {
      const listed = await this.page(
        `/admin/content-items?sectionId=${placement.sectionId}`,
      );
      let item = listed.find((x) => x.title === payload.title);
      const created = !item;
      if (!item)
        item = (await this.call<any>('POST', '/admin/content-items', payload))
          .body;
      this.record(`content.${key}`, item, created ? 'created' : 'reused');
      if (
        assetKey &&
        item.primaryAssetId !== this.states[`asset.${assetKey}`].id
      )
        await this.call(
          'POST',
          `/admin/content-items/${item.id}/primary-asset`,
          { assetId: this.states[`asset.${assetKey}`].id },
        );
      if (key === 'pdf' && created) {
        await this.call('POST', `/admin/content-items/${item.id}/attachments`, {
          assetId: this.states['asset.document'].id,
        });
        await this.call(
          'POST',
          `/admin/content-items/${item.id}/attachments/reorder`,
          { assetIds: [this.states['asset.document'].id] },
        );
      }
      await this.publish('content-items', item);
    }
  }

  private async studentsAndLearning() {
    const gradeId = this.states.grade.id;
    const centerIds = [
      this.states['center.cairo-a'].id,
      this.states['center.cairo-b'].id,
      this.states['center.giza-a'].id,
    ];
    const govIds = [
      this.states['governorate.cairo'].id,
      this.states['governorate.cairo'].id,
      this.states['governorate.giza'].id,
      this.states['governorate.cairo'].id,
    ];
    for (const [index, student] of fixture.students.entries()) {
      const { key: _fixtureKey, ...studentRegistration } = student;
      let token: string | undefined;
      let id: string | undefined;
      const login = await this.publicCall<any>(
        'POST',
        '/auth/students/login',
        { phone: student.phone, password: this.env.demoPassword },
        undefined,
        [201, 401],
      );
      if (login.status === 201) {
        token = login.body.accessToken;
        id = login.body.user.id;
      } else {
        const registered = await this.publicCall<any>(
          'POST',
          '/auth/students/register',
          {
            ...studentRegistration,
            parentPhone:
              index < 2 ? fixture.parentPhone : `+2010000009${30 + index}`,
            governorateId: govIds[index],
            centerId: centerIds[index % centerIds.length],
            academicGradeId: gradeId,
            password: this.env.demoPassword,
          },
        );
        token = registered.body.accessToken;
        id = registered.body.user.id;
      }
      this.record(
        `student.${student.key}`,
        { id },
        login.status === 201 ? 'reused' : 'created',
      );
      this.states[`student.${student.key}`].token = token;
    }
    const learner = this.states['student.learner-a'];
    const entitlement = await this.call<any>(
      'GET',
      `/admin/entitlements?studentUserId=${learner.id}`,
    );
    let active = entitlement.body.find(
      (x: any) =>
        x.courseId === this.states['course.paid'].id && x.status === 'ACTIVE',
    );
    if (!active)
      active = (
        await this.call<any>('POST', '/admin/entitlements', {
          studentUserId: learner.id,
          courseId: this.states['course.paid'].id,
        })
      ).body;
    this.record(
      'entitlement.learning',
      active,
      active.id ? 'reused' : 'created',
    );
    const token = String(learner.token);
    const text = this.states['content.text'];
    await this.publicCall(
      'POST',
      `/student/content-items/${text.id}/complete`,
      undefined,
      token,
    );
    const question = await this.questions();
    const wrong = question.options.find((x: any) => !x.isCorrect);
    const right = question.options.find((x: any) => x.isCorrect);
    const attempts =
      (
        await this.publicCall<any>(
          'GET',
          `/student/practice/questions/${question.id}/attempts`,
          undefined,
          token,
        )
      ).body.data ?? [];
    if (!attempts.length) {
      await this.publicCall(
        'POST',
        `/student/practice/questions/${question.id}/attempts`,
        { optionIds: [wrong.id] },
        token,
      );
      await this.publicCall(
        'POST',
        `/student/practice/questions/${question.id}/attempts`,
        { optionIds: [right.id] },
        token,
      );
    }
  }

  private async questions() {
    const publisherId = this.states.publisher.id;
    const source = await this.findOrCreate(
      'question.source',
      '/admin/question-banks/sources',
      (x) => x.title?.ar === `${MARK} مصدر`,
      '/admin/question-banks/sources',
      {
        type: 'CONTENT_PUBLISHER',
        title: { ar: `${MARK} مصدر`, en: `${MARK} Source` },
        publisherUserId: publisherId,
      },
    );
    const bank = await this.findOrCreate(
      'question.bank',
      '/admin/question-banks',
      (x) => x.title === `${MARK} بنك أسئلة`,
      '/admin/question-banks',
      { title: `${MARK} بنك أسئلة` },
    );
    await this.publish('question-banks/sources', source);
    await this.publish('question-banks', bank);
    const listed = await this.page(`/admin/questions?bankId=${bank.id}`);
    let question = listed.find((x) => x.body === `${MARK} ما الإجابة الصحيحة؟`);
    if (!question)
      question = (
        await this.call<any>('POST', '/admin/questions', {
          bankId: bank.id,
          sourceId: source.id,
          courseId: this.states['course.paid'].id,
          placements: [{ sectionId: this.states.section.id }],
          body: `${MARK} ما الإجابة الصحيحة؟`,
          explanation: 'الإجابة الأولى صحيحة.',
        })
      ).body;
    if (question.options.length < 2) {
      question = (
        await this.call<any>(
          'POST',
          `/admin/questions/${question.id}/options`,
          { body: 'الإجابة الصحيحة', isCorrect: true },
        )
      ).body;
      question = (
        await this.call<any>(
          'POST',
          `/admin/questions/${question.id}/options`,
          { body: 'إجابة خاطئة', isCorrect: false },
        )
      ).body;
      await this.call(
        'POST',
        `/admin/questions/${question.id}/options/reorder`,
        { optionIds: question.options.map((x: any) => x.id) },
      );
    }
    if (
      !question.assets?.some(
        (x: any) => x.assetId === this.states['asset.image'].id,
      )
    )
      await this.call('POST', `/admin/questions/${question.id}/assets`, {
        assetId: this.states['asset.image'].id,
      });
    if (!question.videoLink)
      await this.call('POST', `/admin/questions/${question.id}/video-link`, {
        videoAssetId: this.states['asset.video'].id,
        timestampSeconds: 0,
      });
    if (question.status === 'DRAFT' || question.status === 'REJECTED')
      question = (
        await this.call<any>('POST', `/admin/questions/${question.id}/submit`)
      ).body;
    if (question.status === 'IN_REVIEW')
      question = (
        await this.call<any>('POST', `/admin/questions/${question.id}/publish`)
      ).body;
    const lifecycle = async (
      marker: string,
      finalStatus: 'DRAFT' | 'REJECTED' | 'ARCHIVED',
    ) => {
      const query = finalStatus === 'ARCHIVED' ? '&status=ARCHIVED' : '';
      let item = (
        await this.page(`/admin/questions?bankId=${bank.id}${query}`)
      ).find((candidate) => candidate.body === `${MARK} ${marker}`);
      if (!item)
        item = (
          await this.call<any>('POST', '/admin/questions', {
            bankId: bank.id,
            sourceId: source.id,
            courseId: this.states['course.paid'].id,
            placements: [{ sectionId: this.states.section.id }],
            body: `${MARK} ${marker}`,
            explanation: 'مثال دورة الحياة.',
          })
        ).body;
      if (finalStatus === 'DRAFT') return item;
      if (item.options.length < 2) {
        item = (
          await this.call<any>('POST', `/admin/questions/${item.id}/options`, {
            body: 'صحيح',
            isCorrect: true,
          })
        ).body;
        item = (
          await this.call<any>('POST', `/admin/questions/${item.id}/options`, {
            body: 'خطأ',
            isCorrect: false,
          })
        ).body;
      }
      if (item.status === 'DRAFT')
        item = (
          await this.call<any>('POST', `/admin/questions/${item.id}/submit`)
        ).body;
      if (finalStatus === 'REJECTED' && item.status === 'IN_REVIEW')
        return (
          await this.call<any>('POST', `/admin/questions/${item.id}/reject`, {
            reviewNote: 'مثال مرفوض للتطوير.',
          })
        ).body;
      if (finalStatus === 'ARCHIVED') {
        if (item.status === 'IN_REVIEW')
          item = (
            await this.call<any>('POST', `/admin/questions/${item.id}/publish`)
          ).body;
        if (item.status === 'PUBLISHED')
          item = (
            await this.call<any>('POST', `/admin/questions/${item.id}/archive`)
          ).body;
      }
      return item;
    };
    this.record(
      'question.draft',
      await lifecycle('سؤال مسودة', 'DRAFT'),
      'reused',
    );
    this.record(
      'question.rejected',
      await lifecycle('سؤال مرفوض', 'REJECTED'),
      'reused',
    );
    this.record(
      'question.archived',
      await lifecycle('سؤال مؤرشف', 'ARCHIVED'),
      'reused',
    );
    this.record('question.published', question, 'reused');
    return question;
  }

  private async commerceAgreementsRetention() {
    const course = this.states['course.paid'];
    const chapter = this.states.chapter;
    const lesson = this.states.lesson;
    const publisher = this.states.publisher;
    const now = new Date();
    const startsAt = new Date(now.getTime() - 3600000).toISOString();
    const agreements = await this.call<any>(
      'GET',
      '/admin/publisher-agreements?history=true',
    );
    for (const [key, target, share] of [
      ['agreement.course', { courseId: course.id }, 1000],
      ['agreement.chapter', { chapterId: chapter.id }, 2000],
      ['agreement.lesson', { lessonId: lesson.id }, 3000],
    ] as const) {
      let agreement = agreements.body.find(
        (x: any) =>
          x.publisherUserId === publisher.id &&
          Object.entries(target).every(([name, value]) => x[name] === value),
      );
      if (!agreement)
        agreement = (
          await this.call<any>('POST', '/admin/publisher-agreements', {
            ...target,
            publisherUserId: publisher.id,
            revenueShareBps: share,
            startsAt,
            isPrimary: true,
          })
        ).body;
      if (agreement.status === 'DRAFT')
        agreement = (
          await this.call<any>(
            'POST',
            `/admin/publisher-agreements/${agreement.id}/activate`,
          )
        ).body;
      this.record(key, agreement, 'reused');
    }
    let ended = agreements.body.find(
      (x: any) =>
        x.publisherUserId === publisher.id &&
        x.courseId === course.id &&
        x.isPrimary === false &&
        x.status === 'ENDED',
    );
    if (!ended) {
      ended = (
        await this.call<any>('POST', '/admin/publisher-agreements', {
          courseId: course.id,
          publisherUserId: publisher.id,
          revenueShareBps: 500,
          startsAt: new Date(now.getTime() - 7200000).toISOString(),
          isPrimary: false,
        })
      ).body;
      if (ended.status === 'DRAFT')
        ended = (
          await this.call<any>(
            'POST',
            `/admin/publisher-agreements/${ended.id}/activate`,
          )
        ).body;
      ended = (
        await this.call<any>(
          'POST',
          `/admin/publisher-agreements/${ended.id}/end`,
          { endsAt: now.toISOString() },
        )
      ).body;
    }
    this.record('agreement.ended', ended, 'reused');
    const retained = this.states['student.retained'];
    const grants = (
      await this.call<any>(
        'GET',
        `/admin/entitlements?studentUserId=${retained.id}`,
      )
    ).body;
    if (
      !grants.some(
        (x: any) =>
          x.courseId === this.states['course.retained'].id &&
          x.status === 'ACTIVE',
      )
    )
      await this.call('POST', '/admin/entitlements', {
        studentUserId: retained.id,
        courseId: this.states['course.retained'].id,
      });
    const retainedCourse = (
      await this.call<any>(
        'GET',
        `/admin/courses/${this.states['course.retained'].id}`,
      )
    ).body;
    if (retainedCourse.status !== 'ARCHIVED')
      await this.call('POST', `/admin/courses/${retainedCourse.id}/archive`);

    const revokedStudent = this.states['student.learner-b'];
    const revoked = (
      await this.call<any>(
        'GET',
        `/admin/entitlements?studentUserId=${revokedStudent.id}`,
      )
    ).body.find((x: any) => x.chapterId === chapter.id);
    if (!revoked) {
      const grant = (
        await this.call<any>('POST', '/admin/entitlements', {
          studentUserId: revokedStudent.id,
          chapterId: chapter.id,
        })
      ).body;
      await this.call('POST', `/admin/entitlements/${grant.id}/revoke`);
      this.record('entitlement.revoked', grant, 'created');
    } else this.record('entitlement.revoked', revoked, 'reused');
  }

  private async commerce() {
    const allMethods =
      (await this.call<any>('GET', '/admin/manual-payment-methods')).body
        .data ?? [];
    let method = allMethods.find(
      (x: any) => x.titleAr === `${MARK} تحويل بنكي`,
    );
    const methodCreated = !method;
    if (!method)
      method = (
        await this.call<any>('POST', '/admin/manual-payment-methods', {
          titleAr: `${MARK} تحويل بنكي`,
          titleEn: 'Development bank transfer',
          instructionsAr: 'استخدم الإيصال التجريبي.',
        })
      ).body;
    this.record('payment.method', method, methodCreated ? 'created' : 'reused');

    const course = this.states['course.paid'];
    const chapter = await this.findOrCreate(
      'chapter.commerce',
      `/admin/chapters?courseId=${course.id}`,
      (x) => x.slug === 'dev-seed-commerce-chapter',
      '/admin/chapters',
      {
        title: `${MARK} Commerce chapter`,
        slug: 'dev-seed-commerce-chapter',
        courseId: course.id,
      },
    );
    await this.publish('chapters', chapter);
    const token = String(this.states['student.commerce'].token);
    const createOrder = async (
      targetType: 'COURSE' | 'CHAPTER',
      targetId: string,
      key: string,
    ) => {
      const cart = await this.publicCall<any>(
        'GET',
        '/student/cart',
        undefined,
        token,
      );
      if (
        !cart.body.data.some(
          (item: any) =>
            item.targetType === targetType && item.targetId === targetId,
        )
      )
        await this.publicCall(
          'POST',
          '/student/cart/items',
          { targetType, targetId },
          token,
        );
      return (
        await this.publicApi.request<any>(
          'POST',
          '/student/checkout',
          { manualPaymentMethodId: method.id },
          {
            accessToken: token,
            headers: { 'idempotency-key': `dev-seed-${key}` },
            expected: 201,
          },
        )
      ).body;
    };
    const orderList = async () =>
      (
        await this.publicCall<any>(
          'GET',
          '/student/orders?limit=100',
          undefined,
          token,
        )
      ).body.data as any[];
    const hasTarget = (order: any, id: string) =>
      order.items?.some(
        (item: any) => item.courseId === id || item.chapterId === id,
      );
    let cancelled = (await orderList()).find(
      (order) => order.status === 'CANCELLED' && hasTarget(order, course.id),
    );
    if (!cancelled) {
      cancelled = await createOrder('COURSE', course.id, 'cancelled');
      await this.publicCall(
        'POST',
        `/student/orders/${cancelled.id}/cancel`,
        undefined,
        token,
      );
    }
    this.record('order.cancelled', cancelled, 'reused');
    let awaiting = (await orderList()).find(
      (order) =>
        order.status === 'AWAITING_PAYMENT' &&
        hasTarget(order, this.states.chapter.id),
    );
    if (!awaiting)
      awaiting = await createOrder(
        'CHAPTER',
        this.states.chapter.id,
        'awaiting',
      );
    this.record('order.awaiting', awaiting, 'reused');
    let resubmitted = (await orderList()).find(
      (order) => order.status === 'SUBMITTED' && hasTarget(order, chapter.id),
    );
    if (!resubmitted) {
      resubmitted = await createOrder('CHAPTER', chapter.id, 'resubmitted');
      const proof = await readFile(
        resolve(process.cwd(), 'test-files', 'G5LALx9a8AAH7PH.jpg'),
      );
      const first = await this.publicApi.upload<any>(
        `/student/orders/${resubmitted.id}/payment-proof`,
        {
          buffer: proof,
          filename: 'dev-seed-rejected-receipt.jpg',
          contentType: 'image/jpeg',
        },
        {
          accessToken: token,
          fields: { transactionReference: 'DEV-SEED-REJECTED' },
          headers: { 'idempotency-key': 'dev-seed-rejected-proof' },
          expected: 201,
        },
      );
      await this.call(
        'POST',
        `/admin/payment-submissions/${first.body.id}/reject`,
        { rejectionReason: 'Demo rejection before resubmission' },
      );
      await this.publicApi.upload<any>(
        `/student/orders/${resubmitted.id}/payment-submissions/${first.body.id}/resubmit`,
        {
          buffer: proof,
          filename: 'dev-seed-resubmitted-receipt.jpg',
          contentType: 'image/jpeg',
        },
        {
          accessToken: token,
          fields: { transactionReference: 'DEV-SEED-RESUBMITTED' },
          headers: { 'idempotency-key': 'dev-seed-resubmitted-proof' },
          expected: 201,
        },
      );
    }
    this.record('order.resubmitted', resubmitted, 'reused');
    let approved = (await orderList()).find(
      (order) => order.status === 'APPROVED' && hasTarget(order, course.id),
    );
    if (!approved) {
      approved = await createOrder('COURSE', course.id, 'approved');
      const proof = await readFile(
        resolve(process.cwd(), 'test-files', 'G5LALx9a8AAH7PH.jpg'),
      );
      const submission = await this.publicApi.upload<any>(
        `/student/orders/${approved.id}/payment-proof`,
        {
          buffer: proof,
          filename: 'dev-seed-approved-receipt.jpg',
          contentType: 'image/jpeg',
        },
        {
          accessToken: token,
          fields: { transactionReference: 'DEV-SEED-APPROVED' },
          headers: { 'idempotency-key': 'dev-seed-approved-proof' },
          expected: 201,
        },
      );
      await this.call(
        'POST',
        `/admin/payment-submissions/${submission.body.id}/approve`,
      );
    }
    this.record('order.approved', approved, 'reused');
  }

  private async verify() {
    const course = this.states['course.paid'];
    const catalogue = await this.publicCall<any>(
      'GET',
      `/catalog/courses/${course.id}`,
    );
    assert(
      catalogue.body.id === course.id,
      'Public course verification failed',
    );
    const cover = await this.publicCall<any>(
      'GET',
      `/catalog/courses/${course.id}/cover/access`,
    );
    await fetchDeliveryUrl(cover.body.url, 'dev-seed public cover');
    const learner = this.states['student.learner-a'];
    const token = String(learner.token);
    for (const key of ['pdf', 'image', 'document', 'download']) {
      const item = this.states[`content.${key}`];
      const asset = this.states[`asset.${key}`];
      const access = await this.publicCall<any>(
        'GET',
        `/student/content-items/${item.id}/assets/${asset.id}/access`,
        undefined,
        token,
      );
      await fetchDeliveryUrl(access.body.url, `dev-seed ${key}`);
    }
    assert(
      (await this.publicCall<any>('GET', '/student/progress', undefined, token))
        .body.content.completedItems >= 1,
      'Student progress verification failed',
    );
    assert(
      (
        await this.publicCall<any>(
          'GET',
          '/student/performance',
          undefined,
          token,
        )
      ).body.totalAttempts >= 2,
      'Student performance verification failed',
    );
    const sibling = fixture.students[0];
    const parent = await this.publicCall<any>('POST', '/auth/parents/login', {
      nationalId: sibling.nationalId,
      parentPhone: fixture.parentPhone,
    });
    const selected = await this.publicCall<any>(
      'POST',
      '/auth/parents/select-child',
      { studentUserId: learner.id },
      parent.body.accessToken,
    );
    await this.publicCall(
      'GET',
      '/parent/selected-child/performance',
      undefined,
      selected.body.accessToken,
    );
    const partner = await this.publicCall<any>('POST', '/auth/partners/login', {
      email: fixture.publisher,
      password: this.env.demoPassword,
    });
    await this.publicCall(
      'GET',
      '/partners/me',
      undefined,
      partner.body.accessToken,
    );
  }

  async run() {
    resetDeliveryFetches();
    await this.step('preflight and super-admin login', () => this.login());
    await this.step('identity and geography', () =>
      this.identityAndGeography(),
    );
    await this.step('academic catalogue and pricing', () => this.hierarchy());
    await this.step('Bunny Storage assets', () => this.uploadAssets());
    await this.step('Bunny Stream upload and readiness', () => this.video());
    await this.step('published content', () => this.content());
    await this.step('questions and learner activity', () =>
      this.studentsAndLearning(),
    );
    await this.step('agreements and retained access', () =>
      this.commerceAgreementsRetention(),
    );
    await this.step('manual-payment commerce states', () => this.commerce());
    await this.step('cross-role API verification', () => this.verify());
  }
  async report(error?: unknown) {
    const directory = resolve(process.cwd(), 'reports', 'dev-seed');
    await mkdir(directory, { recursive: true });
    const path = resolve(
      directory,
      `${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    await writeFile(
      path,
      `${JSON.stringify(redact({ target: this.env.baseUrl, webhook: this.env.webhook, states: this.states, checks: this.checks, operations: this.operations, deliveryFetches: getDeliveryFetches(), error: error ? (error instanceof Error ? { message: error.message } : error) : undefined }), null, 2)}\n`,
    );
    return path;
  }
  password() {
    return this.env.demoPassword;
  }
}

async function main() {
  const seed = new Seed();
  let failure: unknown;
  try {
    await seed.run();
  } catch (error) {
    failure = error;
  }
  const report = await seed.report(failure);
  console.log(`dev-seed report: ${report}`);
  if (failure) throw failure;
  console.log(`dev-seed demo password: ${seed.password()}`);
}
main().catch((error) => {
  console.error(
    `dev-seed failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
