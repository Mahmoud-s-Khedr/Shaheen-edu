import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  PaginationQueryDto,
  SearchPaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  CartTargetDto,
  CheckoutDto,
  CreateCouponDto,
  CreateDiscountCampaignDto,
  CreatePaymentMethodDto,
  PaymentSubmissionQueryDto,
  PricePreviewDto,
  RejectPaymentDto,
  ReorderPaymentMethodsDto,
  SubmitPaymentProofDto,
  UpdateCouponDto,
  UpdateDiscountCampaignDto,
  UpdatePaymentMethodDto,
} from './dto/commerce.dto';
import { CommerceService } from './commerce.service';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  CartResponseDto,
  CartItemDto,
  IdDeletedResponseDto,
  IdStatusResponseDto,
  ManualPaymentMethodDto,
  ManualPaymentMethodsResponseDto,
  OrderDto,
  PaginatedManualPaymentMethodsResponseDto,
  PaginatedOrdersResponseDto,
  PaginatedPaymentSubmissionsResponseDto,
  PaymentProofUploadAuthorizationResponseDto,
  PaymentSubmissionDetailDto,
} from './dto/commerce.dto';

@ApiTags('student/commerce')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student', version: '1' })
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('manual-payment-methods')
  @ApiOperation({ summary: 'List active manual payment methods' })
  @ApiOkResponse({ type: PaginatedManualPaymentMethodsResponseDto })
  @ApiStandardErrors(400, 401, 403)
  methods(@Query() query: SearchPaginationQueryDto) {
    return this.commerce.methods(query);
  }
  @Get('cart')
  @ApiOperation({ summary: 'Get the current student cart' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiStandardErrors(401, 403)
  cart(@CurrentUser() user: RequestUser) {
    return this.commerce.cart(user.id);
  }
  @Post('price-preview')
  @ApiOperation({
    summary: 'Preview current campaign/coupon prices for purchasable targets',
  })
  pricePreview(@CurrentUser() user: RequestUser, @Body() dto: PricePreviewDto) {
    return this.commerce.pricePreview(user.id, dto);
  }
  @Post('cart/items')
  @ApiOperation({ summary: 'Add a purchasable target to the cart' })
  @ApiCreatedResponse({ type: CartItemDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  add(@CurrentUser() user: RequestUser, @Body() dto: CartTargetDto) {
    return this.commerce.addCartItem(user.id, dto);
  }
  @Delete('cart/items/:id')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiOkResponse({ type: IdDeletedResponseDto })
  @ApiStandardErrors(401, 403, 404)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.removeCartItem(user.id, id);
  }
  @Post('checkout')
  @ApiOperation({ summary: 'Create an order from the current cart' })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    schema: { type: 'string' },
  })
  @ApiCreatedResponse({ type: OrderDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  checkout(
    @CurrentUser() user: RequestUser,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commerce.checkout(user.id, dto, key);
  }
  @Post('orders/:id/paymob/attempt')
  @ApiOperation({
    summary:
      'Create a fresh hosted Paymob checkout attempt for an unpaid order',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    schema: { type: 'string' },
  })
  retryPaymob(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commerce.createPaymobAttempt(user.id, id, key);
  }
  @Get('orders')
  @ApiOperation({ summary: 'List the student orders' })
  @ApiOkResponse({ type: PaginatedOrdersResponseDto })
  @ApiStandardErrors(400, 401, 403)
  orders(@CurrentUser() user: RequestUser, @Query() query: PaginationQueryDto) {
    return this.commerce.orders(user.id, query);
  }
  @Get('orders/:id')
  @ApiOperation({ summary: 'Get an order by ID' })
  @ApiOkResponse({ type: OrderDto })
  @ApiStandardErrors(401, 403, 404)
  order(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.order(user.id, id);
  }
  @Post('orders/:id/cancel')
  @ApiOperation({ summary: 'Cancel an eligible order' })
  @ApiCreatedResponse({ type: OrderDto })
  @ApiStandardErrors(401, 403, 404, 409)
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.cancel(user.id, id);
  }
  // This preserves the original multipart request as the direct-upload
  // authorization step; the separate /complete route confirms the upload.
  @Post('orders/:id/payment-proof')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Authorize a manual-payment receipt upload' })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    schema: { type: 'string' },
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        transactionReference: { type: 'string', example: 'TXN-12345' },
        note: { type: 'string', example: 'Receipt for August payment' },
      },
    },
  })
  @ApiCreatedResponse({ type: PaymentProofUploadAuthorizationResponseDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  async proof(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Req() req: any,
  ) {
    const part = await req.file();
    if (!part) throw new BadRequestException('A file is required');
    try {
      return await this.commerce.authorizeProofUpload(user.id, id, key, {
        filename: part.filename,
        mimeType: part.mimetype,
        transactionReference: part.fields?.transactionReference?.value
          ? String(part.fields.transactionReference.value)
          : undefined,
        note: part.fields?.note?.value
          ? String(part.fields.note.value)
          : undefined,
      });
    } finally {
      for await (const _chunk of part.file) {
        /* drain */
      }
    }
  }
  @Post('orders/:id/payment-proof/complete')
  @ApiOperation({ summary: 'Confirm a direct payment-proof upload' })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    schema: { type: 'string' },
  })
  @ApiCreatedResponse({ type: IdStatusResponseDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  completeProof(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() dto: SubmitPaymentProofDto,
  ) {
    return this.commerce.submitProof(user.id, id, key, dto);
  }
  @Post('orders/:orderId/payment-submissions/:submissionId/resubmit')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Authorize a replacement receipt upload' })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    schema: { type: 'string' },
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        transactionReference: { type: 'string', example: 'TXN-12345' },
        note: { type: 'string', example: 'Replacement receipt' },
      },
    },
  })
  @ApiCreatedResponse({ type: PaymentProofUploadAuthorizationResponseDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  async resubmit(
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
    @Param('submissionId') submissionId: string,
    @Headers('idempotency-key') key: string,
    @Req() req: any,
  ) {
    const part = await req.file();
    if (!part) throw new BadRequestException('A file is required');
    try {
      return await this.commerce.authorizeResubmitProofUpload(
        user.id,
        orderId,
        submissionId,
        key,
        {
          filename: part.filename,
          mimeType: part.mimetype,
          transactionReference: part.fields?.transactionReference?.value
            ? String(part.fields.transactionReference.value)
            : undefined,
          note: part.fields?.note?.value
            ? String(part.fields.note.value)
            : undefined,
        },
      );
    } finally {
      for await (const _chunk of part.file) {
        /* drain */
      }
    }
  }
  @Post('orders/:orderId/payment-submissions/:submissionId/resubmit/complete')
  @ApiOperation({ summary: 'Confirm a direct replacement receipt upload' })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    schema: { type: 'string' },
  })
  @ApiCreatedResponse({ type: IdStatusResponseDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  completeResubmission(
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
    @Param('submissionId') submissionId: string,
    @Headers('idempotency-key') key: string,
    @Body() dto: SubmitPaymentProofDto,
  ) {
    return this.commerce.resubmitProof(
      user.id,
      orderId,
      submissionId,
      key,
      dto,
    );
  }
}

@ApiTags('admin/manual-payments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class ManualPaymentAdminController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('manual-payment-methods')
  @ApiOperation({ summary: 'List all manual payment methods' })
  @ApiOkResponse({ type: PaginatedManualPaymentMethodsResponseDto })
  @ApiStandardErrors(400, 401, 403)
  methods(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchPaginationQueryDto,
  ) {
    return this.commerce.methodsAdmin(user, query);
  }
  @Post('manual-payment-methods')
  @ApiOperation({ summary: 'Create a manual payment method' })
  @ApiCreatedResponse({ type: ManualPaymentMethodDto })
  @ApiStandardErrors(400, 401, 403)
  createMethod(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePaymentMethodDto,
  ) {
    return this.commerce.createMethod(user, dto);
  }
  @Patch('manual-payment-methods/:id')
  @ApiOperation({ summary: 'Update a manual payment method' })
  @ApiOkResponse({ type: ManualPaymentMethodDto })
  @ApiStandardErrors(400, 401, 403, 404)
  updateMethod(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.commerce.updateMethod(user, id, dto);
  }
  @Post('manual-payment-methods/reorder')
  @ApiOperation({ summary: 'Reorder manual payment methods' })
  @ApiCreatedResponse({ type: ManualPaymentMethodsResponseDto })
  @ApiStandardErrors(400, 401, 403)
  reorder(
    @CurrentUser() user: RequestUser,
    @Body() dto: ReorderPaymentMethodsDto,
  ) {
    return this.commerce.reorderMethods(user, dto.methodIds);
  }
  @Get('payment-submissions')
  @ApiOperation({ summary: 'List manual payment submissions' })
  @ApiOkResponse({ type: PaginatedPaymentSubmissionsResponseDto })
  @ApiStandardErrors(400, 401, 403)
  submissions(
    @CurrentUser() user: RequestUser,
    @Query() query: PaymentSubmissionQueryDto,
  ) {
    return this.commerce.submissions(user, query);
  }
  @Get('payment-submissions/:id')
  @ApiOperation({ summary: 'Get a manual payment submission' })
  @ApiOkResponse({ type: PaymentSubmissionDetailDto })
  @ApiStandardErrors(401, 403, 404)
  submission(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.submission(user, id);
  }
  @Post('payment-submissions/:id/approve')
  @ApiOperation({ summary: 'Approve a manual payment submission' })
  @ApiCreatedResponse({ type: IdStatusResponseDto })
  @ApiStandardErrors(401, 403, 404, 409)
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.approve(user, id);
  }
  @Post('payment-submissions/:id/reject')
  @ApiOperation({ summary: 'Reject a manual payment submission' })
  @ApiCreatedResponse({ type: IdStatusResponseDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reject(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
  ) {
    return this.commerce.reject(user, id, dto);
  }
  @Get('discount-campaigns')
  @ApiOperation({ summary: 'List timed discount campaigns' })
  campaigns(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.commerce.campaigns(user, query);
  }
  @Post('discount-campaigns')
  @ApiOperation({ summary: 'Create a timed discount campaign' })
  createCampaign(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDiscountCampaignDto,
  ) {
    return this.commerce.createCampaign(user, dto);
  }
  @Patch('discount-campaigns/:id')
  @ApiOperation({ summary: 'Update a timed discount campaign' })
  updateCampaign(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateDiscountCampaignDto,
  ) {
    return this.commerce.updateCampaign(user, id, dto);
  }
  @Post('discount-campaigns/:id/activate')
  @ApiOperation({ summary: 'Activate a timed discount campaign' })
  activateCampaign(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.setCampaignActive(user, id, true);
  }
  @Post('discount-campaigns/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a timed discount campaign' })
  deactivateCampaign(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.commerce.setCampaignActive(user, id, false);
  }
  @Get('coupons')
  @ApiOperation({ summary: 'List coupons' })
  coupons(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.commerce.coupons(user, query);
  }
  @Post('coupons')
  @ApiOperation({ summary: 'Create a coupon' })
  createCoupon(@CurrentUser() user: RequestUser, @Body() dto: CreateCouponDto) {
    return this.commerce.createCoupon(user, dto);
  }
  @Patch('coupons/:id')
  @ApiOperation({ summary: 'Update a coupon' })
  updateCoupon(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.commerce.updateCoupon(user, id, dto);
  }
  @Post('coupons/:id/activate')
  @ApiOperation({ summary: 'Activate a coupon' })
  activateCoupon(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.setCouponActive(user, id, true);
  }
  @Post('coupons/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a coupon' })
  deactivateCoupon(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.commerce.setCouponActive(user, id, false);
  }
}

@ApiTags('payments/paymob')
@Public()
@Controller({ path: 'payments/paymob', version: '1' })
export class PaymobWebhookController {
  constructor(private readonly commerce: CommerceService) {}
  @Post('webhook')
  @ApiOperation({ summary: 'Receive a signed Paymob payment callback' })
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: any) {
    const result = await this.commerce.paymobWebhook(
      req.body,
      String(req.query?.hmac ?? ''),
    );
    if (!result.accepted)
      throw new UnauthorizedException('Invalid Paymob HMAC');
    return { received: true, duplicate: result.duplicate };
  }
}
