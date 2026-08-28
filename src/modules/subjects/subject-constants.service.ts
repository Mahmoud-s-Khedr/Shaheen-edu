import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateSubjectConstantDto, UpdateSubjectConstantDto } from './dto/subject-constants.dto';

@Injectable()
export class SubjectConstantsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden');
  }
  private async subject(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
    if (!subject) throw new NotFoundException('Subject not found');
  }
  private normalize(key: string) {
    const value = key.trim();
    if (!value) throw new ConflictException('Constant key must not be blank');
    return value;
  }
  async publicList(subjectId: string) {
    await this.subject(subjectId);
    return { data: await this.prisma.subjectConstant.findMany({ where: { subjectId }, orderBy: [{ key: 'asc' }, { id: 'asc' }] }) };
  }
  async list(actor: RequestUser, subjectId: string) { this.assertAdmin(actor); return this.publicList(subjectId); }
  async get(actor: RequestUser, subjectId: string, id: string) {
    this.assertAdmin(actor);
    const row = await this.prisma.subjectConstant.findFirst({ where: { id, subjectId } });
    if (!row) throw new NotFoundException('Subject constant not found');
    return row;
  }
  async create(actor: RequestUser, subjectId: string, dto: CreateSubjectConstantDto) {
    this.assertAdmin(actor); await this.subject(subjectId);
    try {
      const row = await this.prisma.subjectConstant.create({ data: { subjectId, key: this.normalize(dto.key), value: dto.value } });
      await this.audit.record({ actorUserId: actor.id, action: 'SUBJECT_CONSTANT_CREATED', targetType: 'SubjectConstant', targetId: row.id, metadata: { subjectId, key: row.key } });
      return row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Constant key already exists for this subject');
      throw error;
    }
  }
  async update(actor: RequestUser, subjectId: string, id: string, dto: UpdateSubjectConstantDto) {
    this.assertAdmin(actor); await this.get(actor, subjectId, id);
    try {
      const row = await this.prisma.subjectConstant.update({ where: { id }, data: { ...(dto.key !== undefined ? { key: this.normalize(dto.key) } : {}), ...(dto.value !== undefined ? { value: dto.value } : {}) } });
      await this.audit.record({ actorUserId: actor.id, action: 'SUBJECT_CONSTANT_UPDATED', targetType: 'SubjectConstant', targetId: id, metadata: { subjectId, key: row.key } });
      return row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Constant key already exists for this subject');
      throw error;
    }
  }
  async remove(actor: RequestUser, subjectId: string, id: string) {
    this.assertAdmin(actor); await this.get(actor, subjectId, id);
    await this.prisma.subjectConstant.delete({ where: { id } });
    await this.audit.record({ actorUserId: actor.id, action: 'SUBJECT_CONSTANT_DELETED', targetType: 'SubjectConstant', targetId: id, metadata: { subjectId } });
    return { id, deleted: true };
  }
}
