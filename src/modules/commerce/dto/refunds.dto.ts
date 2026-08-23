import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RefundRequestStatus } from '../../../common/types/roles.enum';

export class CreateRefundRequestDto {
  @ApiPropertyOptional({ type: [String], description: 'Omit to request refunds for every item in the approved order.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderItemIds?: string[];

  @ApiProperty({ description: 'Why the student is requesting a refund.' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class RefundRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RefundRequestStatus })
  @IsOptional()
  @IsEnum(RefundRequestStatus)
  status?: RefundRequestStatus;
}

export class AdminRefundRequestsQueryDto extends RefundRequestsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentUserId?: string;
}

export class ApproveRefundDto {
  @ApiProperty({ description: 'Manual reimbursement reference, such as an email or transfer reference.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  manualRefundReference!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;
}

export class RejectRefundDto {
  @ApiProperty({ description: 'Reason communicated to the student.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  rejectionReason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;
}
