import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../config/configuration';
import { ObservabilityService } from '../../common/logging/observability.service';
import { safeErrorRecord } from '../../common/logging/error-record';

@Injectable()
export class XPayService {
  private readonly config: AppConfig['commerce'];

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly diagnostics?: ObservabilityService,
  ) {
    this.config = config.get('commerce', { infer: true });
  }

  configured() {
    return Boolean(
      this.config.xpaySecretKey &&
      this.config.xpayWebhookSecret &&
      this.config.xpayRedirectUrl,
    );
  }

  async createCheckoutSession(input: {
    merchantReference: string;
    orderId: string;
    paymentAttemptId: string;
    amountMinor: number;
    items: Array<{ title: string; amountMinor: number }>;
    customer: { fullName: string; phone: string; email?: string | null };
    expiresAfterSeconds: number;
  }) {
    if (!this.configured())
      throw new BadRequestException('XPay is not configured');
    const startedAt = performance.now();
    try {
      const response = await fetch(
        `${this.config.xpayApiBaseUrl.replace(/\/$/, '')}/checkout/sessions`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(this.config.xpayTimeoutMs),
          headers: {
            Authorization: `Bearer ${this.config.xpaySecretKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': input.merchantReference,
          },
          body: JSON.stringify({
            afterCompletion: {
              type: 'redirect',
              redirect: { url: this.config.xpayRedirectUrl },
            },
            ...(this.config.xpayCancelUrl
              ? { cancelUrl: this.config.xpayCancelUrl }
              : {}),
            mode: 'payment',
            uiMode: 'hosted',
            currency: 'EGP',
            expiresAfterMinutes: Math.max(
              1,
              Math.ceil(input.expiresAfterSeconds / 60),
            ),
            customerDetails: {
              name: input.customer.fullName,
              phone: input.customer.phone,
              ...(input.customer.email?.includes('@')
                ? { email: input.customer.email }
                : {}),
            },
            lineItems: input.items.map((item) => ({
              priceData: {
                currency: 'EGP',
                unitAmount: item.amountMinor,
                productData: { name: item.title },
              },
              quantity: 1,
            })),
            metadata: {
              orderId: input.orderId,
              paymentAttemptId: input.paymentAttemptId,
              merchantReference: input.merchantReference,
            },
          }),
        },
      );
      const payload: any = await response.json().catch(() => ({}));
      if (!response.ok || !payload.id || !payload.url)
        throw new BadRequestException(
          'XPay could not create a checkout session',
        );
      this.diagnostics?.emit({
        event: 'provider_call_completed',
        operation: 'xpay_create_checkout_session',
        outcome: 'success',
        reasonCode: 'XPAY_OK',
        durationMs: Math.round(performance.now() - startedAt),
        references: {
          merchantReference: this.diagnostics.reference(
            'payment_attempt',
            input.merchantReference,
          ),
        },
      });
      return {
        checkoutSessionId: String(payload.id),
        checkoutUrl: String(payload.url),
        paymentIntentId: payload.paymentIntentId
          ? String(payload.paymentIntentId)
          : null,
      };
    } catch (error) {
      this.diagnostics?.emit({
        event: 'provider_call_completed',
        operation: 'xpay_create_checkout_session',
        outcome: 'failure',
        reasonCode: 'XPAY_REQUEST_FAILED',
        durationMs: Math.round(performance.now() - startedAt),
        ...safeErrorRecord(error),
      });
      throw error;
    }
  }

  verifyWebhookSignature(rawBody: Buffer, header: string) {
    if (!header || !this.config.xpayWebhookSecret) return false;
    const parts = new Map(
      header.split(',').flatMap((part) => {
        const [key, value] = part.trim().split('=', 2);
        return key && value ? [[key, value]] : [];
      }),
    );
    const timestamp = parts.get('t');
    const received = parts.get('v1');
    if (!timestamp || !received || !/^\d+$/.test(timestamp)) return false;
    const timestampSeconds = Number(timestamp);
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300
    )
      return false;
    const expected = createHmac('sha256', this.config.xpayWebhookSecret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const actualBuffer = Buffer.from(received.toLowerCase(), 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
