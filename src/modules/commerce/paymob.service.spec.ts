import { createHmac } from 'node:crypto';
import { PaymobService } from './paymob.service';

describe('PaymobService HMAC verification', () => {
  const secret = 'paymob-hmac-secret';
  const config: any = {
    get: jest
      .fn()
      .mockReturnValue({
        paymobBaseUrl: 'https://accept.paymob.com',
        paymobSecretKey: 'secret',
        paymobPublicKey: 'public',
        paymobHmacSecret: secret,
        paymobIntegrationIds: [1],
        paymobNotificationUrl: 'https://api.example.test/webhook',
        paymobRedirectUrl: 'https://app.example.test/result',
        paymobTimeoutMs: 1000,
        paymobOrderExpirySeconds: 1800,
        manualOrderExpirySeconds: 86400,
      }),
  };

  const transaction = {
    amount_cents: 10000,
    created_at: '2026-08-22T10:00:00.000Z',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 1,
    integration_id: 2,
    is_3d_secure: false,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 3 },
    owner: 4,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success: true,
  };

  it('accepts the documented transaction callback value and rejects tampering', () => {
    const values = [
      transaction.amount_cents,
      transaction.created_at,
      transaction.currency,
      transaction.error_occured,
      transaction.has_parent_transaction,
      transaction.id,
      transaction.integration_id,
      transaction.is_3d_secure,
      transaction.is_auth,
      transaction.is_capture,
      transaction.is_refunded,
      transaction.is_standalone_payment,
      transaction.is_voided,
      transaction.order.id,
      transaction.owner,
      transaction.pending,
      transaction.source_data.pan,
      transaction.source_data.sub_type,
      transaction.source_data.type,
      transaction.success,
    ].join('');
    const hmac = createHmac('sha512', secret).update(values).digest('hex');
    const service = new PaymobService(config);
    expect(service.verifyTransactionHmac(transaction, hmac)).toBe(true);
    expect(
      service.verifyTransactionHmac({ ...transaction, success: false }, hmac),
    ).toBe(false);
  });
});
