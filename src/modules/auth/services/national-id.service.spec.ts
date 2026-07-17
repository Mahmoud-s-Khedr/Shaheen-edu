import { ConfigService } from '@nestjs/config';
import { NationalIdService } from './national-id.service';
import type { AppConfig } from '../../../config/configuration';

function makeService(
  hmacSecret: string,
  encryptionKey: string,
): NationalIdService {
  const configService = {
    get: (key: string) => {
      if (key === 'nationalId') {
        return { hmacSecret, encryptionKey, keyVersion: 1 };
      }
      throw new Error(`unexpected key ${key}`);
    },
  } as unknown as ConfigService<AppConfig, true>;
  return new NationalIdService(configService);
}

describe('NationalIdService', () => {
  const service = makeService(
    'secret-a-xxxxxxxxxxxxxxxxxxxxxxxx',
    'enc-key-a-xxxxxxxxxxxxxxxxxxxx',
  );

  describe('normalize', () => {
    it('strips whitespace and dashes', () => {
      expect(service.normalize(' 299-0101-0112345 ')).toBe('29901010112345');
    });
  });

  describe('validateFormat', () => {
    it('accepts a well-formed 14-digit id', () => {
      expect(service.validateFormat('29901010112345')).toBe(true);
    });

    it('rejects wrong length', () => {
      expect(service.validateFormat('123')).toBe(false);
    });

    it('rejects non-digit characters', () => {
      expect(service.validateFormat('2990101011234X')).toBe(false);
    });

    it('rejects an invalid century digit', () => {
      expect(service.validateFormat('19901010112345')).toBe(false);
    });

    it('rejects an invalid month', () => {
      expect(service.validateFormat('29913010112345')).toBe(false);
    });

    it('rejects an invalid day for the given month', () => {
      expect(service.validateFormat('29902300112345')).toBe(false);
    });
  });

  describe('hash', () => {
    it('is deterministic for the same input', () => {
      const a = service.hash('29901010112345');
      const b = service.hash('29901010112345');
      expect(a).toBe(b);
    });

    it('differs for different secrets', () => {
      const other = makeService(
        'secret-b-yyyyyyyyyyyyyyyyyyyyyyyy',
        'enc-key-a-xxxxxxxxxxxxxxxxxxxx',
      );
      expect(service.hash('29901010112345')).not.toBe(
        other.hash('29901010112345'),
      );
    });

    it('differs for different national ids', () => {
      expect(service.hash('29901010112345')).not.toBe(
        service.hash('29901010112346'),
      );
    });
  });

  describe('encrypt/decrypt', () => {
    it('round-trips correctly', () => {
      const plaintext = '29901010112345';
      const ciphertext = service.encrypt(plaintext);
      expect(ciphertext).not.toContain(plaintext);
      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const a = service.encrypt('29901010112345');
      const b = service.encrypt('29901010112345');
      expect(a).not.toBe(b);
    });
  });

  describe('last4', () => {
    it('returns the last 4 digits', () => {
      expect(service.last4('29901010112345')).toBe('2345');
    });
  });
});
