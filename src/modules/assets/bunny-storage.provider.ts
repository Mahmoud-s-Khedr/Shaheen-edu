import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
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
    this.client = new S3Client({
      region: 'auto',
      endpoint: this.config.endpoint,
      forcePathStyle: true,
      maxAttempts: 3,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5_000,
        requestTimeout: 60_000,
      }),
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  async upload(key: string, body: Readable, mimeType: string): Promise<void> {
    // Bunny rejects a PutObject whose body length is unknown, so unbounded streams go through
    // multipart upload, which sizes each part before signing it (and aborts the upload on failure).
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      },
    }).done();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }

  async createUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number,
  ): Promise<string> {
    // Bunny's S3 client and its presigner resolve compatible runtime middleware;
    // the AWS packages can expose duplicate Smithy type declarations in pnpm.
    return getSignedUrl(
      this.client as never,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: mimeType,
      }) as never,
      { expiresIn },
    );
  }

  async inspect(
    key: string,
  ): Promise<{ sizeBytes: number; mimeType?: string; first: Buffer }> {
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Range: 'bytes=0-15',
      }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of output.Body as Readable)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return {
      sizeBytes: head.ContentLength ?? 0,
      mimeType: head.ContentType,
      first: Buffer.concat(chunks),
    };
  }

  /** Reads a private storage object for trusted server-side processing. */
  async download(key: string): Promise<Buffer> {
    const output = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of output.Body as Readable)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
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
