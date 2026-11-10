/** Allocate a bundle's minor units using the largest-remainder method.
 *
 * Keys are stable snapshot identifiers, and break ties independently of input
 * order. Integer arithmetic keeps large intermediate products exact.
 */
export function allocateBundleRevenue(
  totalMinor: number,
  items: ReadonlyArray<{ key: string; weightMinor: number }>,
): Map<string, number> {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || !items.length)
    throw new Error('Invalid bundle total or empty bundle');
  const keys = new Set<string>();
  for (const item of items) {
    if (
      !item.key ||
      keys.has(item.key) ||
      !Number.isSafeInteger(item.weightMinor) ||
      item.weightMinor < 0
    )
      throw new Error(
        'Bundle items require unique keys and non-negative weights',
      );
    keys.add(item.key);
  }
  const totalWeight = items.reduce(
    (sum, item) => sum + BigInt(item.weightMinor),
    0n,
  );
  if (totalWeight === 0n) {
    if (totalMinor !== 0)
      throw new Error('A paid bundle requires a positive weight');
    return new Map(items.map((item) => [item.key, 0]));
  }
  const total = BigInt(totalMinor);
  const shares = items.map((item) => {
    const product = total * BigInt(item.weightMinor);
    return {
      key: item.key,
      amount: product / totalWeight,
      remainder: product % totalWeight,
    };
  });
  const remaining = Number(
    total - shares.reduce((sum, item) => sum + item.amount, 0n),
  );
  shares.sort((a, b) =>
    a.remainder === b.remainder
      ? a.key < b.key
        ? -1
        : a.key > b.key
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < remaining; i++) shares[i].amount++;
  return new Map(shares.map((item) => [item.key, Number(item.amount)]));
}

/** Calculate one referral commission for a bundle, then distribute it over its lines. */
export function allocateBundleReferral(
  items: ReadonlyArray<{ id: string; priceMinor: number }>,
  terms: {
    kind?: string;
    fixedCommissionMinor?: number | null;
    percentageBps?: number | null;
    maximumCommissionMinor?: number | null;
  },
): Map<string, number> {
  const eligible = items.filter((item) => item.priceMinor > 0);
  const basis = eligible.reduce((sum, item) => sum + item.priceMinor, 0);
  if (!basis) return new Map();
  const raw =
    terms.kind === 'FIXED_PER_SALE'
      ? (terms.fixedCommissionMinor ?? 0)
      : Math.floor((basis * (terms.percentageBps ?? 0)) / 10_000);
  const amount =
    terms.kind === 'PERCENTAGE_CAPPED'
      ? Math.min(raw, terms.maximumCommissionMinor ?? 0)
      : raw;
  if (amount <= 0 || amount > basis) return new Map();
  return allocateBundleRevenue(
    amount,
    eligible.map((item) => ({ key: item.id, weightMinor: item.priceMinor })),
  );
}
