import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { Role } from '../types/roles.enum';
import { assertContentStaff, assertSuperAdmin } from './admin-authorization';

const contentAreas = new Set([
  'ai',
  'video-assets',
  'academic-grades',
  'subjects',
  'subject-constants',
  'courses',
  'chapters',
  'lessons',
  'sections',
  'content-items',
  'videos',
  'assets',
  'question-banks',
  'questions',
  'question-imports',
  'question-ai-explanations',
  'assessments',
  'question-reports',
  'video-feedback',
  'pricing',
]);
function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? controllerFiles(join(dir, entry.name))
      : entry.name.endsWith('.controller.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}
const handlers = controllerFiles(join(__dirname, '../../modules')).flatMap(
  (file) => {
    const exports = require(file) as Record<string, any>;
    return Object.values(exports)
      .filter(
        (controller) =>
          typeof controller === 'function' &&
          String(Reflect.getMetadata(PATH_METADATA, controller)).startsWith(
            'admin/',
          ),
      )
      .flatMap((controller) => {
        const path = Reflect.getMetadata(PATH_METADATA, controller) as string;
        return Object.getOwnPropertyNames(controller.prototype)
          .filter((name) =>
            Reflect.hasMetadata(METHOD_METADATA, controller.prototype[name]),
          )
          .map((name) => ({
            label: `${path}/${name}`,
            controller,
            handler: controller.prototype[name],
            allowed: contentAreas.has(path.split('/')[1]),
          }));
      });
  },
);

describe('Every administrative route authorization', () => {
  it('discovers the complete controller surface', () =>
    expect(handlers.length).toBeGreaterThan(200));
  it.each(handlers)(
    '$label permits the correct staff roles',
    ({ controller, handler, allowed }) => {
      const guards = [
        ...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []),
        ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
      ];
      expect(
        guards.some(
          (guard) => guard === RolesGuard || guard === SuperAdminGuard,
        ),
      ).toBe(true);
      for (const role of [Role.ADMIN, Role.SUPER_ADMIN]) {
        const context = {
          getClass: () => controller,
          getHandler: () => handler,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        } as unknown as ExecutionContext;
        const check = () =>
          guards.forEach((guard) => {
            if (guard === RolesGuard)
              expect(new RolesGuard(new Reflector()).canActivate(context)).toBe(
                true,
              );
            if (guard === SuperAdminGuard)
              expect(new SuperAdminGuard().canActivate(context)).toBe(true);
          });
        if (role === Role.ADMIN && !allowed)
          expect(check).toThrow(ForbiddenException);
        else check();
      }
    },
  );
  it.each(handlers.filter(({ allowed }) => !allowed))(
    '$label rejects Admin at the service boundary',
    async ({ controller, handler }) => {
      const dependencies = Reflect.getMetadata('design:paramtypes', controller);
      const method = handler.toString().match(/this\.\w+\.(\w+)\(/)?.[1];
      expect(method).toBeDefined();
      const service = Object.create(dependencies[0].prototype);
      await expect(
        service[method!]({ id: 'admin', role: Role.ADMIN }, 'id', {}, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it.each(Object.values(Role))('service policy enforces %s', (role) => {
    if (role === Role.ADMIN || role === Role.SUPER_ADMIN)
      expect(() => assertContentStaff({ role })).not.toThrow();
    else expect(() => assertContentStaff({ role })).toThrow(ForbiddenException);
    if (role === Role.SUPER_ADMIN)
      expect(() => assertSuperAdmin({ role })).not.toThrow();
    else expect(() => assertSuperAdmin({ role })).toThrow(ForbiddenException);
  });
});
