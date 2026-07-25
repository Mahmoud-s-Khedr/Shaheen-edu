import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus } from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ownership is structural: userId always comes from req.user.id, never a param. */
  async getOwnProfile(userId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        loginIdentifier: true,
        createdAt: true,
        studentProfile: {
          select: {
            fullName: true,
            governorate: true,
            center: true,
            nationalIdLast4: true,
            academicGradeId: true,
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  async updateOwnProfile(userId: string, dto: UpdateStudentDto) {
    if (dto.academicGradeId !== undefined) {
      const grade = await this.prisma.academicGrade.findFirst({
        where: { id: dto.academicGradeId, status: ContentStatus.PUBLISHED },
      });
      if (!grade) {
        throw new ConflictException('Academic grade must be published');
      }
    }
    const current = await this.prisma.studentProfile.findUniqueOrThrow({ where: { userId }, select: { governorateId: true } });
    const center = dto.center === undefined ? undefined : dto.center?.trim()
      ? await this.prisma.center.upsert({ where: { governorateId_name: { governorateId: current.governorateId, name: dto.center.trim() } }, create: { governorateId: current.governorateId, name: dto.center.trim() }, update: {} })
      : null;
    await this.prisma.studentProfile.update({
      where: { userId },
      data: {
        fullName: dto.fullName,
        center: dto.center,
        ...(dto.center === undefined ? {} : { centerId: center?.id ?? null }),
        academicGradeId: dto.academicGradeId,
      },
    });
    return this.getOwnProfile(userId);
  }
}
