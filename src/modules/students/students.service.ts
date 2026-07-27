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
            governorateRef: { select: { id: true, nameAr: true, nameEn: true } },
            centerRef: { select: { id: true, nameAr: true, nameEn: true } },
            nationalIdLast4: true,
            academicGradeId: true,
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return { ...student, studentProfile: student.studentProfile && { ...student.studentProfile, governorate: this.geographyDto(student.studentProfile.governorateRef), center: this.geographyDto(student.studentProfile.centerRef), governorateRef: undefined, centerRef: undefined } };
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
    const selectedCenter = dto.centerId == null ? null : dto.centerId === undefined ? undefined : await this.prisma.center.findFirst({ where: { id: dto.centerId, governorateId: current.governorateId } });
    if (dto.centerId !== undefined && dto.centerId !== null && !selectedCenter) throw new ConflictException('Center must belong to the student governorate');
    await this.prisma.studentProfile.update({
      where: { userId },
      data: {
        fullName: dto.fullName,
        ...(dto.centerId === undefined ? {} : { centerId: dto.centerId, center: selectedCenter?.nameAr ?? null }),
        academicGradeId: dto.academicGradeId,
      },
    });
    return this.getOwnProfile(userId);
  }

  private geographyDto(record: { id: string; nameAr: string; nameEn: string | null } | null) { return record && { id: record.id, name: { ar: record.nameAr, en: record.nameEn } }; }
}
