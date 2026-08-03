import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { CartTargetDto, CheckoutDto, CreatePaymentMethodDto, PaymentSubmissionQueryDto, RejectPaymentDto, ReorderPaymentMethodsDto, SubmitPaymentProofDto, UpdatePaymentMethodDto } from './dto/commerce.dto';
import { CommerceService } from './commerce.service';

@ApiTags('student/commerce') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.STUDENT)
@Controller({ path: 'student', version: '1' })
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('manual-payment-methods') methods() { return this.commerce.methods(); }
  @Get('cart') cart(@CurrentUser() user: RequestUser) { return this.commerce.cart(user.id); }
  @Post('cart/items') add(@CurrentUser() user: RequestUser, @Body() dto: CartTargetDto) { return this.commerce.addCartItem(user.id, dto); }
  @Delete('cart/items/:id') remove(@CurrentUser() user: RequestUser, @Param('id') id: string) { return this.commerce.removeCartItem(user.id, id); }
  @Post('checkout') checkout(@CurrentUser() user: RequestUser, @Body() dto: CheckoutDto, @Headers('idempotency-key') key: string) { return this.commerce.checkout(user.id, dto, key); }
  @Get('orders') orders(@CurrentUser() user: RequestUser, @Query() query: PaginationQueryDto) { return this.commerce.orders(user.id, query); }
  @Get('orders/:id') order(@CurrentUser() user: RequestUser, @Param('id') id: string) { return this.commerce.order(user.id, id); }
  @Post('orders/:id/cancel') cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) { return this.commerce.cancel(user.id, id); }
  // This preserves the original multipart request as the direct-upload
  // authorization step; the separate /complete route confirms the upload.
  @Post('orders/:id/payment-proof') @ApiConsumes('multipart/form-data') @ApiOperation({ summary: 'Authorize a manual-payment receipt upload' })
  async proof(@CurrentUser() user: RequestUser, @Param('id') id: string, @Headers('idempotency-key') key: string, @Req() req: any) {
    const part = await req.file(); if (!part) throw new BadRequestException('A file is required');
    try { return await this.commerce.authorizeProofUpload(user.id, id, key, { filename: part.filename, mimeType: part.mimetype, transactionReference: part.fields?.transactionReference?.value ? String(part.fields.transactionReference.value) : undefined, note: part.fields?.note?.value ? String(part.fields.note.value) : undefined }); }
    finally { for await (const _chunk of part.file) { /* drain */ } }
  }
  @Post('orders/:id/payment-proof/complete') @ApiOperation({ summary: 'Confirm a direct payment-proof upload' })
  completeProof(@CurrentUser() user: RequestUser, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body() dto: SubmitPaymentProofDto) { return this.commerce.submitProof(user.id, id, key, dto); }
  @Post('orders/:orderId/payment-submissions/:submissionId/resubmit') @ApiConsumes('multipart/form-data') @ApiOperation({ summary: 'Authorize a replacement receipt upload' })
  async resubmit(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string, @Param('submissionId') submissionId: string, @Headers('idempotency-key') key: string, @Req() req: any) {
    const part = await req.file(); if (!part) throw new BadRequestException('A file is required');
    try { return await this.commerce.authorizeResubmitProofUpload(user.id, orderId, submissionId, key, { filename: part.filename, mimeType: part.mimetype, transactionReference: part.fields?.transactionReference?.value ? String(part.fields.transactionReference.value) : undefined, note: part.fields?.note?.value ? String(part.fields.note.value) : undefined }); }
    finally { for await (const _chunk of part.file) { /* drain */ } }
  }
  @Post('orders/:orderId/payment-submissions/:submissionId/resubmit/complete') @ApiOperation({ summary: 'Confirm a direct replacement receipt upload' })
  completeResubmission(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string, @Param('submissionId') submissionId: string, @Headers('idempotency-key') key: string, @Body() dto: SubmitPaymentProofDto) { return this.commerce.resubmitProof(user.id, orderId, submissionId, key, dto); }
}

@ApiTags('admin/manual-payments') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class ManualPaymentAdminController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('manual-payment-methods') methods(@CurrentUser() user: RequestUser) { return this.commerce.methodsAdmin(user); }
  @Post('manual-payment-methods') createMethod(@CurrentUser() user: RequestUser, @Body() dto: CreatePaymentMethodDto) { return this.commerce.createMethod(user, dto); }
  @Patch('manual-payment-methods/:id') updateMethod(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) { return this.commerce.updateMethod(user, id, dto); }
  @Post('manual-payment-methods/reorder') reorder(@CurrentUser() user: RequestUser, @Body() dto: ReorderPaymentMethodsDto) { return this.commerce.reorderMethods(user, dto.methodIds); }
  @Get('payment-submissions') submissions(@CurrentUser() user: RequestUser, @Query() query: PaymentSubmissionQueryDto) { return this.commerce.submissions(user, query); }
  @Get('payment-submissions/:id') submission(@CurrentUser() user: RequestUser, @Param('id') id: string) { return this.commerce.submission(user, id); }
  @Post('payment-submissions/:id/approve') approve(@CurrentUser() user: RequestUser, @Param('id') id: string) { return this.commerce.approve(user, id); }
  @Post('payment-submissions/:id/reject') reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RejectPaymentDto) { return this.commerce.reject(user, id, dto); }
}
