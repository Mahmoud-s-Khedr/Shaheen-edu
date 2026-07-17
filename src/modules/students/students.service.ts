import { Injectable, NotFoundException } from '@nestjs/common';
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
    await this.prisma.studentProfile.update({
      where: { userId },
      data: {
        fullName: dto.fullName,
        center: dto.center,
      },
    });
    return this.getOwnProfile(userId);
  }
}
