import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class PaymobService {
  private readonly config: AppConfig['commerce'];
  constructor(config: ConfigService<AppConfig, true>) {
    this.config = config.get('commerce', { infer: true });
  }

  configured() {
    return Boolean(
      this.config.paymobSecretKey &&
      this.config.paymobPublicKey &&
      this.config.paymobHmacSecret &&
      this.config.paymobIntegrationIds.length &&
      this.config.paymobNotificationUrl &&
      this.config.paymobRedirectUrl,
    );
  }

  async createIntention(input: {
    merchantReference: string;
    amountMinor: number;
    items: Array<{ title: string; amountMinor: number }>;
    customer: { fullName: string; phone: string; email?: string | null };
  }) {
    if (!this.configured())
      throw new BadRequestException('Paymob is not configured');
    const names = input.customer.fullName.trim().split(/\s+/);
    const response = await fetch(`${this.config.paymobBaseUrl}/v1/intention/`, {
      method: 'POST',
      signal: AbortSignal.timeout(this.config.paymobTimeoutMs),
      headers: {
        Authorization: `Token ${this.config.paymobSecretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: 'EGP',
        payment_methods: this.config.paymobIntegrationIds,
        special_reference: input.merchantReference,
        notification_url: this.config.paymobNotificationUrl,
        redirection_url: this.config.paymobRedirectUrl,
        billing_data: {
          first_name: names[0] ?? 'Student',
          last_name: names.slice(1).join(' ') || 'Student',
          email: input.customer.email?.includes('@')
            ? input.customer.email
            : 'student@example.invalid',
          phone_number: input.customer.phone,
        },
        items: input.items.map((item) => ({
          name: item.title,
          amount: item.amountMinor,
          quantity: 1,
        })),
      }),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload.client_secret)
      throw new BadRequestException(
        'Paymob could not create a payment intention',
      );
    return {
      providerOrderId: payload.id ? String(payload.id) : null,
      clientSecret: String(payload.client_secret),
      checkoutUrl: `${this.config.paymobBaseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(this.config.paymobPublicKey)}&clientSecret=${encodeURIComponent(payload.client_secret)}`,
      payload,
    };
  }

  verifyTransactionHmac(obj: any, received: string) {
    if (!received || !this.config.paymobHmacSecret) return false;
    const values = [
      obj?.amount_cents,
      obj?.created_at,
      obj?.currency,
      obj?.error_occured,
      obj?.has_parent_transaction,
      obj?.id,
      obj?.integration_id,
      obj?.is_3d_secure,
      obj?.is_auth,
      obj?.is_capture,
      obj?.is_refunded,
      obj?.is_standalone_payment,
      obj?.is_voided,
      obj?.order?.id,
      obj?.owner,
      obj?.pending,
      obj?.source_data?.pan,
      obj?.source_data?.sub_type,
      obj?.source_data?.type,
      obj?.success,
    ]
      .map((value) =>
        typeof value === 'boolean'
          ? String(value)
          : value === null || value === undefined
            ? ''
            : String(value),
      )
      .join('');
    const calculated = createHmac('sha512', this.config.paymobHmacSecret)
      .update(values)
      .digest('hex');
    const actual = Buffer.from(received.toLowerCase(), 'utf8');
    const expected = Buffer.from(calculated, 'utf8');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
