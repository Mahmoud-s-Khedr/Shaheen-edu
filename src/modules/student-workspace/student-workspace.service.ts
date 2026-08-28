import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';
import type { CreateNotebookPageDto, CreateQuestionHighlightDto, UpdateNotebookPageDto } from './dto/student-workspace.dto';

@Injectable()
export class StudentWorkspaceService {
  constructor(private readonly prisma: PrismaService, private readonly assessments: AssessmentsService) {}

  private highlightDto(row: any) {
    return { id: row.id, questionId: row.questionId, selectedText: row.selectedText, startOffset: row.startOffset, endOffset: row.endOffset, color: row.color, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }
  async listHighlights(studentId: string, questionId: string) {
    const sourceQuestionId = await this.assessments.assertAccessibleSourceQuestion(studentId, questionId);
    const data = await this.prisma.studentQuestionHighlight.findMany({ where: { studentUserId: studentId, questionId: sourceQuestionId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return { data: data.map((row) => this.highlightDto(row)) };
  }
  async createHighlight(studentId: string, questionId: string, dto: CreateQuestionHighlightDto) {
    const sourceQuestionId = await this.assessments.assertAccessibleSourceQuestion(studentId, questionId);
    const question = await this.prisma.question.findUniqueOrThrow({ where: { id: sourceQuestionId }, select: { body: true } });
    if (dto.endOffset <= dto.startOffset || dto.endOffset > question.body.length || question.body.slice(dto.startOffset, dto.endOffset) !== dto.selectedText)
      throw new BadRequestException('Highlight offsets and selectedText must match the question text');
    const row = await this.prisma.studentQuestionHighlight.create({ data: { studentUserId: studentId, questionId: sourceQuestionId, selectedText: dto.selectedText, startOffset: dto.startOffset, endOffset: dto.endOffset, color: dto.color?.trim() || null } });
    return this.highlightDto(row);
  }
  async deleteHighlight(studentId: string, questionId: string, highlightId: string) {
    const sourceQuestionId = await this.assessments.assertAccessibleSourceQuestion(studentId, questionId);
    const row = await this.prisma.studentQuestionHighlight.findFirst({ where: { id: highlightId, studentUserId: studentId, questionId: sourceQuestionId }, select: { id: true } });
    if (!row) throw new NotFoundException('Question highlight not found');
    await this.prisma.studentQuestionHighlight.delete({ where: { id: row.id } });
    return { id: row.id, deleted: true };
  }
  private async page(studentId: string, pageId: string) {
    const page = await this.prisma.studentNotebookPage.findFirst({ where: { id: pageId, studentUserId: studentId } });
    if (!page) throw new NotFoundException('Notebook page not found');
    return page;
  }
  async listPages(studentId: string) { return { data: await this.prisma.studentNotebookPage.findMany({ where: { studentUserId: studentId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }) }; }
  async createPage(studentId: string, dto: CreateNotebookPageDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title must not be blank');
    return this.prisma.studentNotebookPage.create({ data: { studentUserId: studentId, title, content: dto.content } });
  }
  async getPage(studentId: string, pageId: string) { return this.page(studentId, pageId); }
  async updatePage(studentId: string, pageId: string, dto: UpdateNotebookPageDto) {
    if (dto.title === undefined && dto.content === undefined) throw new BadRequestException('Provide title or content');
    const title = dto.title?.trim();
    if (dto.title !== undefined && !title) throw new BadRequestException('Title must not be blank');
    await this.page(studentId, pageId);
    return this.prisma.studentNotebookPage.update({ where: { id: pageId }, data: { ...(title !== undefined ? { title } : {}), ...(dto.content !== undefined ? { content: dto.content } : {}) } });
  }
  async deletePage(studentId: string, pageId: string) { await this.page(studentId, pageId); await this.prisma.studentNotebookPage.delete({ where: { id: pageId } }); return { id: pageId, deleted: true }; }
}
