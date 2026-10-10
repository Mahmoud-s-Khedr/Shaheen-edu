import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePartnerEmailDto } from './update-partner-email.dto';

describe('UpdatePartnerEmailDto', () => {
  it('normalizes a valid email', async () => {
    const dto = plainToInstance(UpdatePartnerEmailDto, {
      email: ' Almarji@Jibal-Platform.com ',
    });
    expect(dto.email).toBe('almarji@jibal-platform.com');
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([undefined, null, '', 'not-an-email', 123])(
    'rejects invalid email %j',
    async (email) => {
      const dto = plainToInstance(UpdatePartnerEmailDto, { email });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
});
