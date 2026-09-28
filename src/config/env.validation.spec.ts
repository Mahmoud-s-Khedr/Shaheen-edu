import { xpayRedirectUrlValidationSchema } from './env.validation';

describe('XPAY_REDIRECT_URL validation', () => {
  it('accepts the supported Checkout Session template in an HTTPS URL', () => {
    expect(
      xpayRedirectUrlValidationSchema.validate(
        'https://app.example.test/payment-result?xpay_session_id={CHECKOUT_SESSION_ID}',
      ).error,
    ).toBeUndefined();
  });

  it.each([
    'https://app.example.test/payment-result?xpay_session_id={PAYMENT_ID}',
    'https://app.example.test/{CHECKOUT_SESSION_ID}/{CHECKOUT_SESSION_ID}',
    'http://app.example.test/payment-result?xpay_session_id={CHECKOUT_SESSION_ID}',
    'not a URL?xpay_session_id={CHECKOUT_SESSION_ID}',
  ])('rejects unsupported or malformed template URL %s', (value) => {
    expect(xpayRedirectUrlValidationSchema.validate(value).error).toBeDefined();
  });
});
