import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

/**
 * Only loginIdentifier (email) is updatable via this endpoint - there is no
 * other admin profile field in the schema yet. Self password changes go
 * through /auth/change-password only.
 */
export class UpdateAdminDto {
  @ApiProperty({ example: 'new-admin@example.com' })
  @IsEmail()
  email!: string;
}
