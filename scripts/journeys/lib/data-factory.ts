import { randomBytes } from 'node:crypto';

export class DataFactory {
  readonly runId = `journey-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
  private serial = 0;
  private next(): string { this.serial += 1; return `${this.runId}-${this.serial}`; }
  email(role: string): string { return `${role}-${this.next()}@example.test`; }
  password(role: string): string { return `${role}-${randomBytes(8).toString('hex')}!Aa`; }
  phone(): string { return `010${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, '0')}`; }
  nationalId(): string { return `2990101${String(randomBytes(4).readUInt32BE() % 10_000_000).padStart(7, '0')}`; }
  title(kind: string): string { return `${kind} ${this.next()}`; }
  slug(kind: string): string { return `${kind}-${this.next().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }
}
