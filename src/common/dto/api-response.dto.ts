import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus, PartnerType, Role } from '../types/roles.enum';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({
    example: 'Unauthorized',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({ example: 'Unauthorized' })
  error!: string;

  @ApiProperty({ example: '3eb75610-8bc8-4fc2-b821-dc90d7f3f39a' })
  correlationId!: string;
}

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ example: 'user@example.com' })
  loginIdentifier!: string;
}

export class AuthTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class ParentAccessTokenResponseDto {
  @ApiProperty()
  accessToken!: string;
}

export class UserSummaryDto extends AuthUserDto {
  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastLoginAt?: Date | null;
}

export class AdminSummaryDto extends UserSummaryDto {}

export class PartnerSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty()
  loginIdentifier!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ enum: PartnerType, nullable: true })
  partnerType!: PartnerType | null;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true })
  legalName!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;
}

export class ParentChildDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  governorate!: string;

  @ApiProperty({ nullable: true })
  center!: string | null;
}

export class PaginatedAdminResponseDto {
  @ApiProperty({ type: [AdminSummaryDto] })
  data!: AdminSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedPartnerResponseDto {
  @ApiProperty({ type: [PartnerSummaryDto] })
  data!: PartnerSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedParentChildResponseDto {
  @ApiProperty({ type: [ParentChildDto] })
  data!: ParentChildDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class StudentProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty()
  loginIdentifier!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    nullable: true,
    properties: {
      fullName: { type: 'string' },
      governorate: { type: 'string' },
      center: { type: 'string', nullable: true },
      nationalIdLast4: { type: 'string' },
      academicGradeId: { type: 'string', nullable: true },
    },
  })
  studentProfile!: object | null;
}

export class CurrentUserDto extends UserSummaryDto {}
