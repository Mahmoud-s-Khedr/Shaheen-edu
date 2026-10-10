import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPartnerPasswordDto } from './reset-partner-password.dto';

const options = { whitelist: true, forbidNonWhitelisted: true };

describe('ResetPartnerPasswordDto', () => {
  it.each(['a'.repeat(8), 'a'.repeat(128), ' AdminChosenPassword123! '])(
    'accepts valid passwords without changing their value',
    async (password) => {
      const dto = plainToInstance(ResetPartnerPasswordDto, { password });
      expect(await validate(dto, options)).toEqual([]);
      expect(dto.password).toBe(password);
    },
  );

  it.each([undefined, null, '', 'a'.repeat(7), 'a'.repeat(129), 123])(
    'rejects invalid password %j',
    async (password) => {
      const dto = plainToInstance(ResetPartnerPasswordDto, { password });
      expect((await validate(dto, options)).length).toBeGreaterThan(0);
    },
  );

  it('rejects extra fields', async () => {
    const dto = plainToInstance(ResetPartnerPasswordDto, {
      password: 'ValidPassword123!',
      mustChangePassword: true,
    });
    expect((await validate(dto, options)).length).toBeGreaterThan(0);
  });
});
