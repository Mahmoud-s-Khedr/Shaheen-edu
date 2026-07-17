import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies a matching password', async () => {
    const hash = await service.hash('CorrectHorseBattery1!');
    await expect(service.verify(hash, 'CorrectHorseBattery1!')).resolves.toBe(
      true,
    );
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('CorrectHorseBattery1!');
    await expect(service.verify(hash, 'WrongPassword1!')).resolves.toBe(false);
  });

  it('does not silently truncate long passwords (different long passwords hash differently)', async () => {
    const base = 'A'.repeat(100);
    const passwordA = `${base}1`;
    const passwordB = `${base}2`;
    const hash = await service.hash(passwordA);
    await expect(service.verify(hash, passwordB)).resolves.toBe(false);
    await expect(service.verify(hash, passwordA)).resolves.toBe(true);
  });

  it('produces a different hash for the same password each time (random salt)', async () => {
    const hashA = await service.hash('SamePassword1!');
    const hashB = await service.hash('SamePassword1!');
    expect(hashA).not.toBe(hashB);
  });
});
