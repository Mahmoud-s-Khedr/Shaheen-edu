import { Readable } from 'node:stream';

export interface FileStorageProvider {
  upload(
    key: string,
    body: Readable,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  createProtectedUrl(key: string, expiresAt: Date): string;
}
