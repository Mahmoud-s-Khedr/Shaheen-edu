/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP tests inspect parsed JSON response bodies. */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../src/database/prisma.service';
import { Role } from '../src/common/types/roles.enum';
import type { AppConfig } from '../src/config/configuration';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedGovernorate,
  seedPublishedAcademicGrade,
} from './utils/db';

interface TestForm {
  id: string;
  title: string;
  status: string;
  questions: Array<{
    id: string;
    title: string;
    type: 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
    required: boolean;
    options: Array<{ id: string; label: string }>;
  }>;
}

const definition = {
  title: 'Platform feedback',
  description: 'Tell us what you think.',
  confirmationMessage: 'Thank you!',
  questions: [
    { title: 'Comments', type: 'TEXT', required: false },
    {
      title: 'Experience',
      type: 'SINGLE_CHOICE',
      required: true,
      options: [{ label: 'Good' }, { label: 'Average' }],
    },
    {
      title: 'Topics',
      type: 'MULTIPLE_CHOICE',
      required: true,
      options: [
        { label: 'Physics' },
        { label: 'Chemistry' },
        { label: 'Math' },
      ],
    },
  ],
};

function answers(form: TestForm) {
  return {
    answers: [
      { questionId: form.questions[0].id, text: 'More lessons please' },
      {
        questionId: form.questions[1].id,
        optionIds: [form.questions[1].options[0].id],
      },
      {
        questionId: form.questions[2].id,
        optionIds: [
          form.questions[2].options[0].id,
          form.questions[2].options[1].id,
        ],
      },
    ],
  };
}

describe('Internal forms (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let superToken: string;
  let adminToken: string;
  let partnerToken: string;
  let studentToken: string;
  let secondStudentToken: string;
  let parentToken: string;
  let sameParentToken: string;
  let otherParentToken: string;
  let superId: string;

  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  const create = async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/forms',
      headers: headers(superToken),
      payload: definition,
    });
    expect(response.statusCode).toBe(201);
    return response.json<TestForm>();
  };
  const activate = async (id: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/forms/${id}/activate`,
      headers: headers(superToken),
    });
    expect(response.statusCode).toBe(201);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(app);
    await flushTestRedis(app);
    const config = app
      .get(ConfigService<AppConfig, true>)
      .get('jwt', { infer: true });
    const tokenFor = async (role: Role) => {
      const user = await prisma.user.create({
        data: {
          role,
          loginIdentifier: `forms-${role}@example.com`,
          passwordHash: 'unused-test-hash',
        },
      });
      const session = await prisma.authSession.create({
        data: {
          userId: user.id,
          refreshTokenHash: `forms-${role}`,
          familyId: `forms-${role}`,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      if (role === Role.SUPER_ADMIN) superId = user.id;
      return jwt.sign(
        { sub: user.id, sid: session.id, role, typ: 'user_access' },
        config.accessSecret,
        { expiresIn: '1h' },
      );
    };
    superToken = await tokenFor(Role.SUPER_ADMIN);
    adminToken = await tokenFor(Role.ADMIN);
    partnerToken = await tokenFor(Role.PARTNER);
    const grade = await seedPublishedAcademicGrade(app, 'forms-test-grade');
    const governorate = await seedGovernorate(app, 'Forms Cairo');
    for (const [index, nationalId, phone] of [
      [0, '29903030312341', '01055551111'],
      [1, '29903030312342', '01055553333'],
    ] as const) {
      const registration = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: {
          fullName: `Forms Student ${index}`,
          nationalId,
          phone,
          parentPhone: '01066662222',
          password: 'StudentP@ss1!',
          academicGradeId: grade.id,
          governorateId: governorate.id,
        },
      });
      expect(registration.statusCode).toBe(201);
      if (index === 0) studentToken = registration.json().accessToken;
      else secondStudentToken = registration.json().accessToken;
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/parents/login',
        payload: { nationalId, parentPhone: '01066662222' },
      });
      expect(login.statusCode).toBe(201);
      if (index === 0) parentToken = login.json().accessToken;
      else sameParentToken = login.json().accessToken;
    }
    const otherSession = await prisma.parentAccessSession.create({
      data: {
        parentPhoneNormalized: '+201099990000',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    otherParentToken = jwt.sign(
      { pid: otherSession.id, active: null, typ: 'parent_access' },
      config.parentAccessSecret,
      { expiresIn: '1h' },
    );
  });

  beforeEach(async () => {
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    await flushTestRedis(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication and keeps all management operations super-admin only', async () => {
    for (const path of [
      'admin/forms',
      'student/forms/active',
      'parent/forms/active',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/${path}`,
      });
      expect(response.statusCode).toBe(401);
    }
    const endpoints = [
      ['GET', ''],
      ['POST', ''],
      ['GET', '/missing'],
      ['PATCH', '/missing'],
      ['DELETE', '/missing'],
      ['POST', '/missing/activate'],
      ['POST', '/missing/close'],
      ['GET', '/missing/submissions'],
      ['GET', '/missing/submissions/missing'],
      ['GET', '/missing/results'],
    ] as const;
    for (const token of [adminToken, partnerToken, studentToken]) {
      for (const [method, suffix] of endpoints) {
        const response = await app.inject({
          method,
          url: `/api/v1/admin/forms${suffix}`,
          headers: headers(token),
        });
        expect(response.statusCode).toBe(403);
      }
    }
    for (const token of [superToken, adminToken, partnerToken]) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/student/forms/active',
        headers: headers(token),
      });
      expect(response.statusCode).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/student/forms/active',
          headers: headers(parentToken),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/parent/forms/active',
          headers: headers(studentToken),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/admin/forms',
          headers: headers(parentToken),
        })
      ).statusCode,
    ).toBe(401);
  });

  it('returns no active form to students and parents without requiring child selection', async () => {
    await create();
    for (const [role, token] of [
      ['student', studentToken],
      ['parent', parentToken],
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/${role}/forms/active`,
        headers: headers(token),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        form: null,
        hasSubmitted: false,
        submissionId: null,
      });
    }
  });

  it('creates, edits, reorders, removes and adds draft questions while preserving supplied IDs', async () => {
    const form = await create();
    const [text, single, multiple] = form.questions;
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/forms/${form.id}`,
      headers: headers(superToken),
      payload: {
        title: 'Edited',
        description: null,
        questions: [
          {
            id: multiple.id,
            title: multiple.title,
            type: multiple.type,
            required: true,
            options: [...multiple.options]
              .reverse()
              .map(({ id, label }) => ({ id, label })),
          },
          {
            id: single.id,
            title: single.title,
            type: single.type,
            required: true,
            options: [
              { id: single.options[0].id, label: single.options[0].label },
              { label: 'New option' },
            ],
          },
          { title: 'New text', type: 'TEXT' },
        ],
      },
    });
    expect(update.statusCode).toBe(200);
    const updated = update.json<TestForm>();
    expect(updated.title).toBe('Edited');
    expect(updated.questions.map((q) => q.id)).toEqual([
      multiple.id,
      single.id,
      expect.any(String),
    ]);
    expect(updated.questions[0].options.map((o) => o.id)).toEqual(
      [...multiple.options].reverse().map((o) => o.id),
    );
    expect(
      await prisma.formQuestion.findUnique({ where: { id: text.id } }),
    ).toBeNull();
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${form.id}`,
      headers: headers(superToken),
    });
    expect(detail.json().title).toBe('Edited');
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/forms/${form.id}`,
      headers: headers(superToken),
    });
    expect(deleted.statusCode).toBe(200);
    expect(
      await prisma.formQuestion.count({ where: { formId: form.id } }),
    ).toBe(0);
    expect(
      await prisma.adminAuditLog.count({
        where: {
          targetId: form.id,
          action: { in: ['FORM_CREATED', 'FORM_UPDATED', 'FORM_DELETED'] },
        },
      }),
    ).toBe(3);
  });

  it('rejects nested arrays as options on create and update without changing the draft', async () => {
    const form = await create();
    const payload = {
      title: 'Invalid update',
      questions: [
        { title: 'Bad choice', type: 'SINGLE_CHOICE', options: [[], []] },
      ],
    };
    for (const [method, url] of [
      ['POST', '/api/v1/admin/forms'],
      ['PATCH', `/api/v1/admin/forms/${form.id}`],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: headers(superToken),
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(await prisma.form.count()).toBe(1);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${form.id}`,
      headers: headers(superToken),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<TestForm>()).toEqual(form);
  });

  it('rejects malformed definitions, invalid question ownership, and null replacements', async () => {
    for (const payload of [
      { ...definition, title: '   ' },
      { ...definition, questions: [] },
      {
        ...definition,
        questions: [
          {
            title: 'Bad choice',
            type: 'SINGLE_CHOICE',
            options: [{ label: 'One' }],
          },
        ],
      },
      {
        ...definition,
        questions: [
          { title: 'Bad text', type: 'TEXT', options: [{ label: 'Invalid' }] },
        ],
      },
      { ...definition, questions: [{ title: 'Bad type', type: 'FILE' }] },
      {
        ...definition,
        questions: [
          { title: 'Invalid required flag', type: 'TEXT', required: 'false' },
        ],
      },
      {
        ...definition,
        questions: [{ title: 'Bad ID', type: 'TEXT', id: 'foreign' }],
      },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/admin/forms',
            headers: headers(superToken),
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    const form = await create();
    const other = await create();
    for (const payload of [
      { questions: null },
      { title: null },
      {
        questions: [
          {
            id: other.questions[0].id,
            title: 'Foreign question',
            type: 'TEXT',
          },
        ],
      },
      {
        questions: [form.questions[0], form.questions[0]].map(
          ({ id, title, type }) => ({ id, title, type }),
        ),
      },
      {
        questions: [
          {
            id: form.questions[1].id,
            title: 'Foreign option',
            type: 'SINGLE_CHOICE',
            options: [
              { id: other.questions[1].options[0].id, label: 'Foreign' },
              { label: 'Valid' },
            ],
          },
        ],
      },
    ]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/forms/${form.id}`,
        headers: headers(superToken),
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(
      await prisma.formQuestion.count({ where: { formId: form.id } }),
    ).toBe(3);
  });

  it('switches active forms, freezes published definitions, and retains the closed form', async () => {
    const first = await create();
    const second = await create();
    await activate(first.id);
    await activate(first.id); // Idempotent retry.
    await activate(second.id);
    expect(
      (await prisma.form.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe('CLOSED');
    for (const id of [first.id, second.id]) {
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/admin/forms/${id}`,
            headers: headers(superToken),
            payload: { title: 'Forbidden edit' },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/admin/forms/${id}`,
            headers: headers(superToken),
          })
        ).statusCode,
      ).toBe(409);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/forms/${first.id}/activate`,
          headers: headers(superToken),
        })
      ).statusCode,
    ).toBe(409);
    const active = await app.inject({
      method: 'GET',
      url: '/api/v1/student/forms/active',
      headers: headers(studentToken),
    });
    expect(active.json().form.id).toBe(second.id);
    expect(active.json().form.createdById).toBeUndefined();
    expect(active.json().form.submissions).toBeUndefined();
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/forms?status=CLOSED&page=1&limit=1',
      headers: headers(superToken),
    });
    expect(list.json().meta).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
    expect(list.json().data[0].submissionCount).toBe(0);
  });

  it('serializes concurrent activations and enforces the active invariant in PostgreSQL', async () => {
    const first = await create();
    const second = await create();
    await Promise.all([activate(first.id), activate(second.id)]);
    expect(await prisma.form.count({ where: { status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.form.count({ where: { status: 'CLOSED' } })).toBe(1);
    const draft = await create();
    await expect(
      prisma.form.update({
        where: { id: draft.id },
        data: { status: 'ACTIVE' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('saves text, single and multiple choices; separates parent and student submissions', async () => {
    const form = await create();
    await activate(form.id);
    for (const [role, token] of [
      ['student', studentToken],
      ['parent', parentToken],
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/${role}/forms/${form.id}/submissions`,
        headers: headers(token),
        payload: answers(form),
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().answers).toHaveLength(3);
      expect(response.json().answers[2].optionIds).toEqual(
        answers(form).answers[2].optionIds,
      );
      expect(response.json().confirmationMessage).toBe('Thank you!');
      const active = await app.inject({
        method: 'GET',
        url: `/api/v1/${role}/forms/active`,
        headers: headers(token),
      });
      expect(active.json()).toMatchObject({
        hasSubmitted: true,
        submissionId: response.json().id,
      });
    }
    const repeat = await app.inject({
      method: 'POST',
      url: `/api/v1/parent/forms/${form.id}/submissions`,
      headers: headers(sameParentToken),
      payload: answers(form),
    });
    expect(repeat.statusCode).toBe(409);
    expect(
      await prisma.formSubmission.count({ where: { formId: form.id } }),
    ).toBe(2);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/parent/forms/${form.id}/submission`,
          headers: headers(sameParentToken),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/parent/forms/${form.id}/submission`,
          headers: headers(otherParentToken),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/student/forms/${form.id}/submission`,
          headers: headers(secondStudentToken),
        })
      ).statusCode,
    ).toBe(404);
  });

  it('rejects invalid answers atomically without consuming the response allowance', async () => {
    const form = await create();
    await activate(form.id);
    const [text, single, multi] = form.questions;
    const valid = answers(form).answers;
    const invalid = [
      [],
      [...valid, valid[0]],
      [...valid, { questionId: 'foreign', text: 'Bad' }],
      [
        valid[0],
        { questionId: single.id, optionIds: single.options.map((o) => o.id) },
        valid[2],
      ],
      [
        valid[0],
        { questionId: single.id, optionIds: [multi.options[0].id] },
        valid[2],
      ],
      [{ questionId: text.id, text: '   ' }, valid[1], valid[2]],
      [
        {
          questionId: text.id,
          text: 'Mixed',
          optionIds: [single.options[0].id],
        },
        valid[1],
        valid[2],
      ],
      [valid[0], { questionId: single.id, text: 'Wrong type' }, valid[2]],
      [
        valid[0],
        valid[1],
        {
          questionId: multi.id,
          optionIds: [multi.options[0].id, multi.options[0].id],
        },
      ],
      [valid[0], valid[1], { questionId: multi.id, optionIds: [] }],
      [valid[0], valid[1], { questionId: multi.id, optionIds: null }],
    ];
    for (const invalidAnswers of invalid) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/student/forms/${form.id}/submissions`,
        headers: headers(studentToken),
        payload: { answers: invalidAnswers },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(await prisma.formSubmission.count()).toBe(0);
    expect(await prisma.formAnswer.count()).toBe(0);
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/student/forms/${form.id}/submissions`,
      headers: headers(studentToken),
      payload: { answers: valid.slice(1) },
    });
    expect(accepted.statusCode).toBe(201);
  });

  it('allows a final empty submission when every question is optional', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/forms',
      headers: headers(superToken),
      payload: {
        title: 'Optional',
        questions: [{ title: 'Comment', type: 'TEXT' }],
      },
    });
    expect(created.statusCode).toBe(201);
    const form = created.json<TestForm>();
    await activate(form.id);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/student/forms/${form.id}/submissions`,
      headers: headers(studentToken),
      payload: { answers: [] },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().answers).toEqual([]);
  });

  it('accepts only one of two concurrent submissions', async () => {
    const form = await create();
    await activate(form.id);
    const responses = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: `/api/v1/student/forms/${form.id}/submissions`,
          headers: headers(studentToken),
          payload: answers(form),
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(await prisma.formSubmission.count()).toBe(1);
    expect(await prisma.formAnswer.count()).toBe(3);
  });

  it('rejects draft and closed submissions, supports closing retries, and preserves own answers', async () => {
    const form = await create();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/student/forms/${form.id}/submissions`,
          headers: headers(studentToken),
          payload: answers(form),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/forms/${form.id}/close`,
          headers: headers(superToken),
        })
      ).statusCode,
    ).toBe(409);
    await activate(form.id);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/student/forms/${form.id}/submissions`,
          headers: headers(studentToken),
          payload: answers(form),
        })
      ).statusCode,
    ).toBe(201);
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/admin/forms/${form.id}/close`,
            headers: headers(superToken),
          })
        ).statusCode,
      ).toBe(201);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/parent/forms/${form.id}/submissions`,
          headers: headers(parentToken),
          payload: answers(form),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/student/forms/${form.id}/submission`,
          headers: headers(studentToken),
        })
      ).statusCode,
    ).toBe(200);
  });

  it('orders submission against closure so no late response is committed', async () => {
    const form = await create();
    await activate(form.id);
    let unlock!: () => void;
    let ready!: () => void;
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const closeTransaction = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(63421, 1)::text`;
        await tx.form.update({
          where: { id: form.id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
        ready();
        await release;
      },
      { timeout: 10000 },
    );
    await locked;
    const pending = app
      .inject({
        method: 'POST',
        url: `/api/v1/student/forms/${form.id}/submissions`,
        headers: headers(studentToken),
        payload: answers(form),
      })
      .then((response) => response);
    let waiting = false;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const locks = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks WHERE locktype = 'advisory'
            AND classid = 63421 AND objid = 1 AND NOT granted
          ) AS waiting
        `;
        if (locks[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      unlock();
      await closeTransaction;
    }
    expect(waiting).toBe(true);
    expect((await pending).statusCode).toBe(409);
    expect(await prisma.formSubmission.count()).toBe(0);
  });

  it('paginates responses, filters respondent types, and calculates multi-select statistics', async () => {
    const form = await create();
    await activate(form.id);
    for (const [role, token, payload] of [
      ['student', studentToken, answers(form)],
      [
        'student',
        secondStudentToken,
        {
          answers: [
            {
              questionId: form.questions[1].id,
              optionIds: [form.questions[1].options[1].id],
            },
            {
              questionId: form.questions[2].id,
              optionIds: [form.questions[2].options[0].id],
            },
          ],
        },
      ],
      ['parent', parentToken, answers(form)],
    ] as const) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/${role}/forms/${form.id}/submissions`,
            headers: headers(token),
            payload,
          })
        ).statusCode,
      ).toBe(201);
    }
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${form.id}/submissions?respondentType=STUDENT&page=1&limit=1`,
      headers: headers(superToken),
    });
    expect(list.json().meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(list.json().data[0].studentName).toMatch(/^Forms Student/);
    const submissionId = list.json().data[0].id;
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${form.id}/submissions/${submissionId}`,
      headers: headers(superToken),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().answers.length).toBeGreaterThan(0);
    const other = await create();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/admin/forms/${other.id}/submissions/${submissionId}`,
          headers: headers(superToken),
        })
      ).statusCode,
    ).toBe(404);
    const result = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${form.id}/results?respondentType=STUDENT`,
      headers: headers(superToken),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().totalSubmissions).toBe(2);
    expect(result.json().questions[0].answerCount).toBe(1);
    expect(
      result
        .json<{
          questions: Array<{ options: Array<{ percentage: number }> }>;
        }>()
        .questions[1].options.map((o: { percentage: number }) => o.percentage),
    ).toEqual([50, 50]);
    expect(
      result
        .json<{
          questions: Array<{ options: Array<{ percentage: number }> }>;
        }>()
        .questions[2].options.map((o: { percentage: number }) => o.percentage),
    ).toEqual([100, 50, 0]);
    const all = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${form.id}/results`,
      headers: headers(superToken),
    });
    expect(all.json().totalSubmissions).toBe(3);
    const parents = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${form.id}/results?respondentType=PARENT`,
      headers: headers(superToken),
    });
    expect(parents.json().totalSubmissions).toBe(1);
    const empty = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/forms/${other.id}/results`,
      headers: headers(superToken),
    });
    expect(empty.json().questions[1].options[0].percentage).toBe(0);
  });

  it('enforces parent versus student identity in the database', async () => {
    const form = await create();
    await expect(
      prisma.formSubmission.create({
        data: {
          formId: form.id,
          respondentType: 'PARENT',
          studentUserId: superId,
        },
      }),
    ).rejects.toThrow('FormSubmission_respondent_identity');
  });
});
