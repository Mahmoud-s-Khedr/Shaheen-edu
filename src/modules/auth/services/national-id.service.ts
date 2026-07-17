import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { AppConfig } from '../../../config/configuration';

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Handles Egyptian National ID normalization, structural validation, HMAC
 * hashing (for deterministic, non-reversible lookup) and AES-256-GCM
 * encryption (for reversible storage, e.g. manual admin verification).
 *
 * Never let a raw National ID reach a log line, API response, or Swagger
 * example anywhere in the codebase.
 */
@Injectable()
export class NationalIdService {
  private readonly hmacSecret: string;
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const nationalIdConfig = this.configService.get('nationalId', {
      infer: true,
    });
    this.hmacSecret = nationalIdConfig.hmacSecret;
    // Derive a stable 32-byte AES-256 key from the configured secret,
    // regardless of the raw secret's length/encoding.
    this.encryptionKey = crypto.scryptSync(
      nationalIdConfig.encryptionKey,
      'national-id-encryption-salt',
      32,
    );
  }

  normalize(raw: string): string {
    return raw.replace(/[\s-]/g, '');
  }

  /**
   * Structural validation only: length, digits, century marker, valid
   * month/day. Does NOT verify the final checksum digit - see README "Known
   * open items" for why that's a documented v1 shortcut.
   */
  validateFormat(normalized: string): boolean {
    if (!/^\d{14}$/.test(normalized)) {
      return false;
    }
    const century = normalized[0];
    if (century !== '2' && century !== '3') {
      return false;
    }
    const month = parseInt(normalized.slice(3, 5), 10);
    const day = parseInt(normalized.slice(5, 7), 10);
    if (month < 1 || month > 12) {
      return false;
    }
    const maxDay = DAYS_IN_MONTH[month - 1];
    if (day < 1 || day > maxDay) {
      return false;
    }
    return true;
  }

  hash(normalized: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(normalized)
      .digest('hex');
  }

  encrypt(normalized: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(normalized, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    const [ivB64, authTagB64, dataB64] = ciphertext.split(':');
    if (!ivB64 || !authTagB64 || !dataB64) {
      throw new Error('Malformed national ID ciphertext');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString('utf8');
  }

  last4(normalized: string): string {
    return normalized.slice(-4);
  }
}
