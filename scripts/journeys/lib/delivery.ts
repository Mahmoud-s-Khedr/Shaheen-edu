import { assert, expectString } from './assertions.js';

export interface DeliveryFetchRecord {
  label: string;
  url: string;
  status?: number;
  fileSize: number;
  error?: string;
}

const deliveryFetches: DeliveryFetchRecord[] = [];
const DELIVERY_FETCH_ATTEMPTS = 3;

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

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
  let lastError: unknown;
  for (let attempt = 1; attempt <= DELIVERY_FETCH_ATTEMPTS; attempt += 1) {
    let response: Response;
    let body: ArrayBuffer;
    try {
      response = await fetch(parsed);
      body = await response.arrayBuffer();
    } catch (error) {
      lastError = error;
      if (attempt < DELIVERY_FETCH_ATTEMPTS) {
        await pause(250 * attempt);
        continue;
      }
      break;
    }
    if (response.status >= 500 && attempt < DELIVERY_FETCH_ATTEMPTS) {
      await pause(250 * attempt);
      continue;
    }
    deliveryFetches.push({
      label,
      url: parsed.toString(),
      status: response.status,
      fileSize: body.byteLength,
    });
    assert(response.ok, `${label} URL must resolve (received ${response.status})`);
    assert(body.byteLength > 0, `${label} URL must return a non-empty response body`);
    return;
  }
  deliveryFetches.push({
    label,
    url: parsed.toString(),
    fileSize: 0,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}
