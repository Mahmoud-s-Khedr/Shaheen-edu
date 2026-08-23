import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../types/roles.enum';

export const STUDENT_360_SECTIONS = [
  'PROFILE',
  'CONTACT',
  'ACCESS',
  'COMMERCE',
  'PERFORMANCE',
  'AUDIT_EVENTS',
] as const;

export type Student360Section = (typeof STUDENT_360_SECTIONS)[number];

export interface PrivacyPolicyConfig {
  requireReasonForSensitive360?: boolean;
  requireReasonForPrivilegedExports?: boolean;
  supportReasonAllowlist?: string[];
}

/**
 * Central policy for the support and reporting surfaces.  The raw/encrypted
 * national-ID fields are deliberately not represented here: no role or
 * section is ever allowed to request them.
 */
export class PrivacyPolicy {
  private readonly config: Required<PrivacyPolicyConfig>;

  constructor(config: PrivacyPolicyConfig = {}) {
    this.config = {
      requireReasonForSensitive360: config.requireReasonForSensitive360 ?? true,
      requireReasonForPrivilegedExports:
        config.requireReasonForPrivilegedExports ?? true,
      supportReasonAllowlist: (config.supportReasonAllowlist ?? [])
        .map((reason) => reason.trim())
        .filter(Boolean),
    };
  }

  student360SectionsFor(role: Role): readonly Student360Section[] {
    if (role === Role.SUPER_ADMIN) return STUDENT_360_SECTIONS;
    if (role === Role.ADMIN) {
      return ['PROFILE', 'CONTACT', 'ACCESS', 'COMMERCE', 'PERFORMANCE'];
    }
    return [];
  }

  student360DefaultSections(role: Role): readonly Student360Section[] {
    return this.student360SectionsFor(role).filter(
      (section) => section !== 'AUDIT_EVENTS',
    );
  }

  assertStudent360Access(
    role: Role,
    sections: readonly Student360Section[],
    reason?: string,
  ): string | undefined {
    const allowed = this.student360SectionsFor(role);
    if (
      !sections.length ||
      sections.some((section) => !allowed.includes(section))
    ) {
      throw new ForbiddenException(
        'The requested Student 360 section is not permitted',
      );
    }
    return this.assertReason(
      sections.some((section) => this.isSensitiveStudent360Section(section)),
      reason,
      'A support reason is required for this Student 360 access',
    );
  }

  assertPrivilegedExportReason(reason?: string): string | undefined {
    return this.assertReason(
      this.config.requireReasonForPrivilegedExports,
      reason,
      'A reason is required for this privileged export',
    );
  }

  private isSensitiveStudent360Section(section: Student360Section) {
    return (
      this.config.requireReasonForSensitive360 &&
      ['CONTACT', 'COMMERCE', 'AUDIT_EVENTS'].includes(section)
    );
  }

  private assertReason(
    required: boolean,
    reason: string | undefined,
    missingMessage: string,
  ) {
    const normalized = reason?.trim();
    if (required && !normalized) throw new BadRequestException(missingMessage);
    if (
      normalized &&
      this.config.supportReasonAllowlist.length > 0 &&
      !this.config.supportReasonAllowlist.includes(normalized)
    ) {
      throw new BadRequestException(
        'The supplied support reason is not approved by policy',
      );
    }
    return normalized || undefined;
  }
}
