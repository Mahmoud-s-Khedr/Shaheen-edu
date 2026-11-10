import { ApiProperty } from '@nestjs/swagger';
import {
  CommerceTargetType,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentChannel,
} from '../../../common/types/roles.enum';
import { StudentSalesOfferDto } from './sales-offer.dto';

/** Raw order-line fields returned by the administrator review queue. */
export class SalesOfferReviewItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty({ type: String, nullable: true }) salesOfferPurchaseId!:
    string | null;
  @ApiProperty({ enum: CommerceTargetType }) targetType!: CommerceTargetType;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;
  @ApiProperty({ type: String, nullable: true }) chapterId!: string | null;
  @ApiProperty() titleSnapshot!: string;
  @ApiProperty() basePriceMinor!: number;
  @ApiProperty() discountMinor!: number;
  @ApiProperty() priceMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: Object, nullable: true }) appliedPromotionSnapshot!:
    object | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class SalesOfferReviewPurchaseDto {
  @ApiProperty() id!: string;
  @ApiProperty() salesOfferId!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() studentUserId!: string;
  @ApiProperty({ type: StudentSalesOfferDto }) snapshot!: StudentSalesOfferDto;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  allocatedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  releasedAt!: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class SalesOfferReviewPaymentAttemptDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty({ enum: PaymentChannel }) channel!: PaymentChannel;
  @ApiProperty({ enum: PaymentAttemptStatus }) status!: PaymentAttemptStatus;
  @ApiProperty() attemptNumber!: number;
  @ApiProperty() merchantReference!: string;
  @ApiProperty({ type: String, nullable: true }) providerOrderId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) providerTransactionId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) checkoutUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureMessage!: string | null;
  @ApiProperty({ type: Object, nullable: true }) providerPayload!:
    object | null;
  @ApiProperty({ format: 'date-time' }) initiatedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

/** This queue retains raw minor-unit fields rather than the student OrderDto. */
export class SalesOfferPaymentReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() studentUserId!: string;
  @ApiProperty({ type: String, nullable: true }) manualPaymentMethodId!:
    string | null;
  @ApiProperty({ enum: PaymentChannel }) paymentChannel!: PaymentChannel;
  @ApiProperty({ type: Object }) paymentMethodSnapshot!: object;
  @ApiProperty() subtotalMinor!: number;
  @ApiProperty() discountMinor!: number;
  @ApiProperty() totalMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty({ type: String, nullable: true }) paymentAttentionReason!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) externalRefundReference!:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  approvedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paymentExpiresAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiredAt!: Date | null;
  @ApiProperty({ type: [SalesOfferReviewItemDto] })
  items!: SalesOfferReviewItemDto[];
  @ApiProperty({ type: [SalesOfferReviewPurchaseDto] })
  salesOfferPurchases!: SalesOfferReviewPurchaseDto[];
  @ApiProperty({ type: [SalesOfferReviewPaymentAttemptDto] })
  paymentAttempts!: SalesOfferReviewPaymentAttemptDto[];
}

export class SalesOfferPaymentReviewsResponseDto {
  @ApiProperty({ type: [SalesOfferPaymentReviewDto] })
  data!: SalesOfferPaymentReviewDto[];
}

export class RecordedOfferRefundDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: [OrderStatus.CANCELLED] }) status!: 'CANCELLED';
  @ApiProperty() externalRefundReference!: string;
}

export class SalesOfferCoverAccessDto {
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
}
