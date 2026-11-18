import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { Role } from '../types/roles.enum';
import type { RequestWithUser } from '../types/request-with-user.types';
import {
  assertResource,
  assertTeacherVideo,
  type CourseResource,
} from '../authorization/course-scope';

const COURSE_RESOURCE = 'course-scope-resource';

/** Endpoint defense for direct IDs; services also scope all reads and writes.
 * Lists and create placements are constrained by their service database query.
 */
@Injectable()
export class CourseScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.role !== Role.TEACHER) return true;
    const resource = this.reflector.getAllAndOverride<
      CourseResource | 'videoAsset'
    >(COURSE_RESOURCE, [context.getHandler(), context.getClass()]);
    const id = (request.params as { id?: string })?.id;
    if (!resource || !id) return true;
    if (resource === 'videoAsset')
      await assertTeacherVideo(this.prisma, request.user, id);
    else await assertResource(this.prisma, request.user, resource, id);
    return true;
  }
}

export function CourseScoped(resource: CourseResource | 'videoAsset') {
  return applyDecorators(
    SetMetadata(COURSE_RESOURCE, resource),
    UseGuards(CourseScopeGuard),
  );
}
