import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PartnerAllocationKind, PartnerAllocationState } from '../../../common/types/roles.enum';

export class AdminAllocationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() partnerUserId?: string;
  @ApiPropertyOptional({ enum: PartnerAllocationKind }) @IsOptional() @IsEnum(PartnerAllocationKind) kind?: PartnerAllocationKind;
  @ApiPropertyOptional({ enum: PartnerAllocationState }) @IsOptional() @IsEnum(PartnerAllocationState) state?: PartnerAllocationState;
  @ApiPropertyOptional() @IsOptional() @IsString() publisherAgreementId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referralRuleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CreateSettlementDto {
  @ApiProperty({ type: [String], minItems: 1 }) @IsArray() @ArrayMinSize(1) @IsString({ each: true }) allocationIds!: string[];
  @ApiProperty({ example: 'BANK-TRANSFER-20260823-001' }) @IsString() @MaxLength(160) paymentReference!: string;
}

export class SettlementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() partnerUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}
