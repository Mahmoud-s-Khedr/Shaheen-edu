import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { RequestParentSession } from '../../common/types/request-with-user.types';

/**
 * Domain reads for parent-scoped data (the parent auth flow itself -
 * login/children/select-child/selected-child - lives in modules/auth since
 * it's part of the auth surface).
 *
 * Every read here re-verifies the target student's parentPhoneNormalized
 * still matches the session's parentPhoneNormalized, in addition to
 * filtering by req.parentSession.activeStudentId - defense-in-depth beyond
 * what ParentAuthGuard/ParentSelectedChildGuard already enforce.
 */
@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSelectedChildProfile(parentSession: RequestParentSession) {
    if (!parentSession.activeStudentId) {
      throw new ForbiddenException('No child selected');
    }
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: parentSession.activeStudentId },
    });
    if (
      !student ||
      student.parentPhoneNormalized !== parentSession.parentPhoneNormalized
    ) {
      throw new ForbiddenException('Student is not linked to this parent');
    }
    return {
      userId: student.userId,
      fullName: student.fullName,
      governorate: student.governorate,
      center: student.center,
    };
  }
}
