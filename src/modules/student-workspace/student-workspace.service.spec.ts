import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentWorkspaceService } from './student-workspace.service';

describe('StudentWorkspaceService', () => {
  function build() {
    const prisma: any = {
      question: { findUniqueOrThrow: jest.fn().mockResolvedValue({ body: 'Question text' }) },
      studentQuestionHighlight: { create: jest.fn().mockResolvedValue({ id: 'highlight', questionId: 'question', selectedText: 'Question', startOffset: 0, endOffset: 8, color: null, createdAt: new Date(), updatedAt: new Date() }), findFirst: jest.fn(), delete: jest.fn() },
      studentNotebookPage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };
    const assessments = { assertAccessibleSourceQuestion: jest.fn().mockResolvedValue('question') };
    return { service: new StudentWorkspaceService(prisma, assessments as any), prisma, assessments };
  }

  it('validates that persisted highlight offsets reproduce the selected text', async () => {
    const { service } = build();
    await expect(service.createHighlight('student', 'question', { selectedText: 'wrong', startOffset: 0, endOffset: 8 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes highlight deletion to the authenticated student', async () => {
    const { service, prisma } = build();
    prisma.studentQuestionHighlight.findFirst.mockResolvedValue(null);
    await expect(service.deleteHighlight('student-a', 'question', 'other-students-highlight')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.studentQuestionHighlight.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ studentUserId: 'student-a' }) }));
  });

  it('never reads a notebook page outside its student owner', async () => {
    const { service, prisma } = build();
    prisma.studentNotebookPage.findFirst.mockResolvedValue(null);
    await expect(service.getPage('student-a', 'student-b-page')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.studentNotebookPage.findFirst).toHaveBeenCalledWith({ where: { id: 'student-b-page', studentUserId: 'student-a' } });
  });
});
