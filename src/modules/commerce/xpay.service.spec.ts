import { createHmac } from 'node:crypto';
import { XPayService } from './xpay.service';

describe('XPayService webhook verification', () => {
  const secret = 'xpay-webhook-secret';
  const config: any = {
    get: jest.fn().mockReturnValue({
      xpayApiBaseUrl: 'https://api.xpay.app',
      xpaySecretKey: 'sk_test_example',
      xpayWebhookSecret: secret,
      xpayRedirectUrl:
        'https://app.example.test/payment-result?xpay_session_id={CHECKOUT_SESSION_ID}',
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

  it('sends the configured Checkout Session template to XPay unchanged', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.xpay.app/session/cs_test_123',
      }),
    } as any);

    await new XPayService(config).createCheckoutSession({
      merchantReference: 'order-1:1',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      amountMinor: 15000,
      items: [{ title: 'Physics', amountMinor: 15000 }],
      customer: { fullName: 'Student', phone: '01000000000' },
      expiresAfterSeconds: 1800,
    });

    const requestOptions = fetchMock.mock.calls[0]?.[1];
    const body = requestOptions?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string')
      throw new Error('Expected a JSON request body');
    const request = JSON.parse(body) as {
      afterCompletion: { redirect: { url: string } };
    };
    expect(request.afterCompletion.redirect.url).toBe(
      'https://app.example.test/payment-result?xpay_session_id={CHECKOUT_SESSION_ID}',
    );
  });
});
