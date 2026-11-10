import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CommerceTargetType } from '../../../common/types/roles.enum';

export class SalesOfferItemDto {
  @ApiProperty({
    enum: [CommerceTargetType.COURSE, CommerceTargetType.CHAPTER],
  })
  @IsIn([CommerceTargetType.COURSE, CommerceTargetType.CHAPTER])
  targetType!: 'COURSE' | 'CHAPTER';

  @ApiProperty()
  @IsString()
  @MinLength(1)
  targetId!: string;
}

export class SaveSalesOfferDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  marketingCopy?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() coverAssetId?: string | null;
  @ApiProperty({ description: 'Price in EGP minor units' })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  priceMinor!: number;
  @ApiProperty() @Type(() => Date) @IsDate() startsAt!: Date;
  @ApiProperty() @Type(() => Date) @IsDate() endsAt!: Date;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  purchaseLimit?: number | null;
  @ApiProperty({ type: [SalesOfferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOfferItemDto)
  items!: SalesOfferItemDto[];
}

export class SalesOfferAdminItemDto extends SalesOfferItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() offerId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;
  @ApiProperty({ type: String, nullable: true }) chapterId!: string | null;
}
export class SalesOfferAdminDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) marketingCopy!: string | null;
  @ApiProperty({ type: String, nullable: true }) coverAssetId!: string | null;
  @ApiProperty() priceMinor!: number;
  @ApiProperty({ format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ type: Number, nullable: true }) purchaseLimit!: number | null;
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ENDED'] }) status!: string;
  @ApiPropertyOptional({
    description: 'Allocated, unreleased purchases; included in lists',
  })
  soldCount?: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Remaining spots; included in lists',
  })
  remainingSpots?: number | null;
  @ApiProperty({ type: [SalesOfferAdminItemDto] })
  items!: SalesOfferAdminItemDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}
export class StudentSalesOfferItemDto extends SalesOfferItemDto {
  @ApiProperty() courseId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({
    description:
      'Current individual EGP price in minor units; frozen at checkout',
  })
  weightMinor!: number;
  @ApiProperty() owned!: boolean;
}
export class StudentSalesOfferDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) marketingCopy!: string | null;
  @ApiProperty({ type: String, nullable: true }) coverAssetId!: string | null;
  @ApiProperty() priceMinor!: number;
  @ApiProperty({ example: 'EGP' }) currency!: string;
  @ApiProperty({ format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ENDED'] }) status!: string;
  @ApiProperty({ type: Number, nullable: true }) purchaseLimit!: number | null;
  @ApiProperty({ type: Number, nullable: true }) remainingSpots!: number | null;
  @ApiProperty() purchased!: boolean;
  @ApiProperty() available!: boolean;
  @ApiProperty({ type: [StudentSalesOfferItemDto] })
  items!: StudentSalesOfferItemDto[];
}
export class StudentSalesOfferListDto {
  @ApiProperty({ type: [StudentSalesOfferDto] }) data!: StudentSalesOfferDto[];
}
