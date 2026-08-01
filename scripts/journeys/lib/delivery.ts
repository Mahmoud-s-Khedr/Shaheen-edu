import { assert, expectString } from './assertions.js';

export interface DeliveryFetchRecord {
  label: string;
  url: string;
  status?: number;
  fileSize: number;
  error?: string;
}

const deliveryFetches: DeliveryFetchRecord[] = [];

/** Clears delivery evidence before a new journey runner starts. */
export function resetDeliveryFetches(): void {
  deliveryFetches.length = 0;
}

/** Returns the download evidence captured during the current journey run. */
export function getDeliveryFetches(): readonly DeliveryFetchRecord[] {
  return deliveryFetches;
}

/** Fetches a browser-delivery URL and consumes bytes to prove it can actually be used. */
export async function fetchDeliveryUrl(url: unknown, label: string): Promise<void> {
  expectString(url, `${label} URL`);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`${label} returned an invalid URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must use HTTP(S)`);
  let recorded = false;
  try {
    const response = await fetch(parsed);
    const body = await response.arrayBuffer();
    deliveryFetches.push({
      label,
      url: parsed.toString(),
      status: response.status,
      fileSize: body.byteLength,
    });
    recorded = true;
    assert(response.ok, `${label} URL must resolve (received ${response.status})`);
    assert(body.byteLength > 0, `${label} URL must return a non-empty response body`);
  } catch (error) {
    if (!recorded)
      deliveryFetches.push({
        label,
        url: parsed.toString(),
        fileSize: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    throw error;
  }
}
