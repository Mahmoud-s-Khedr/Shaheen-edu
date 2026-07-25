import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import type { AppConfig } from '../../config/configuration';
import type { FileStorageProvider } from './file-storage.provider';

@Injectable()
export class BunnyStorageProvider implements FileStorageProvider {
  private readonly client: S3Client;
  private readonly config;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = configService.get('storage', { infer: true });
    this.client = new S3Client({ region: 'auto', endpoint: this.config.endpoint, forcePathStyle: true, credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey } });
  }

  async upload(key: string, body: Readable, mimeType: string): Promise<void> {
    // Bunny rejects a PutObject whose body length is unknown, so unbounded streams go through
    // multipart upload, which sizes each part before signing it (and aborts the upload on failure).
    await new Upload({ client: this.client, params: { Bucket: this.config.bucket, Key: key, Body: body, ContentType: mimeType } }).done();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  createProtectedUrl(key: string, expiresAt: Date): string {
    const base = this.config.pullZoneUrl.replace(/\/$/, '');
    const path = `/${key.split('/').map(encodeURIComponent).join('/')}`;
    const expires = Math.floor(expiresAt.getTime() / 1000).toString();
    // Bunny advanced-token signing without optional signing data or IP binding.
    const token = `HS256-${createHmac('sha256', this.config.tokenKey).update(`${path}${expires}`).digest('base64url')}`;
    return `${base}${path}?token=${encodeURIComponent(token)}&expires=${expires}`;
  }
}
