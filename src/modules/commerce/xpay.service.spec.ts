import { createHmac } from 'node:crypto';
import { XPayService } from './xpay.service';

describe('XPayService webhook verification', () => {
  const secret = 'xpay-webhook-secret';
  const config: any = {
    get: jest.fn().mockReturnValue({
      xpayApiBaseUrl: 'https://api.xpay.app',
      xpaySecretKey: 'sk_test_example',
      xpayWebhookSecret: secret,
      xpayRedirectUrl: 'https://app.example.test/payment-result',
      xpayCancelUrl: '',
      xpayTimeoutMs: 1000,
      xpayOrderExpirySeconds: 1800,
      manualOrderExpirySeconds: 86400,
    }),
  };

  it('accepts a current signed raw body and rejects a tampered body', () => {
    const rawBody = Buffer.from(
      '{"id":"evt_123","type":"checkout.session.completed"}',
    );
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const service = new XPayService(config);

    expect(
      service.verifyWebhookSignature(rawBody, `t=${timestamp},v1=${signature}`),
    ).toBe(true);
    expect(
      service.verifyWebhookSignature(
        Buffer.from('{"id":"evt_tampered"}'),
        `t=${timestamp},v1=${signature}`,
      ),
    ).toBe(false);
  });

  it('rejects stale signatures before parsing or processing a webhook', () => {
    const rawBody = Buffer.from('{"id":"evt_123"}');
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');

    expect(
      new XPayService(config).verifyWebhookSignature(
        rawBody,
        `t=${timestamp},v1=${signature}`,
      ),
    ).toBe(false);
  });
});
