import {
  allocateBundleRevenue,
  allocateBundleReferral,
} from './bundle-allocation';

describe('allocateBundleRevenue', () => {
  it('allocates every minor unit proportionally with stable tie breaking', () => {
    const items = [
      { key: 'b', weightMinor: 100 },
      { key: 'a', weightMinor: 100 },
      { key: 'c', weightMinor: 200 },
    ];
    expect(Object.fromEntries(allocateBundleRevenue(7, items))).toEqual({
      a: 2,
      b: 2,
      c: 3,
    });
    expect(allocateBundleRevenue(7, items)).toEqual(
      allocateBundleRevenue(7, [...items].reverse()),
    );
  });

  it('uses exact arithmetic for large intermediate products', () => {
    const shares = allocateBundleRevenue(Number.MAX_SAFE_INTEGER, [
      { key: 'a', weightMinor: Number.MAX_SAFE_INTEGER },
      { key: 'b', weightMinor: Number.MAX_SAFE_INTEGER },
    ]);
    expect(shares.get('a')).toBe(4503599627370496);
    expect(shares.get('b')).toBe(4503599627370495);
  });

  it('rejects invalid and duplicate weights', () => {
    expect(() => allocateBundleRevenue(1, [])).toThrow();
    expect(() =>
      allocateBundleRevenue(1, [{ key: 'a', weightMinor: -1 }]),
    ).toThrow();
    expect(() =>
      allocateBundleRevenue(1, [
        { key: 'a', weightMinor: 1 },
        { key: 'a', weightMinor: 1 },
      ]),
    ).toThrow();
  });

  it('assigns zero revenue to free content and supports free bundles', () => {
    expect(
      allocateBundleRevenue(100, [
        { key: 'free', weightMinor: 0 },
        { key: 'paid', weightMinor: 200 },
      ]).get('free'),
    ).toBe(0);
    expect(
      allocateBundleRevenue(0, [{ key: 'free', weightMinor: 0 }]).get('free'),
    ).toBe(0);
    expect(() =>
      allocateBundleRevenue(1, [{ key: 'free', weightMinor: 0 }]),
    ).toThrow();
  });
});

describe('allocateBundleReferral', () => {
  const items = [
    { id: 'a', priceMinor: 234 },
    { id: 'b', priceMinor: 467 },
  ];
  it('charges one fixed commission per bundle and splits it across lines', () => {
    const shares = allocateBundleReferral(items, {
      kind: 'FIXED_PER_SALE',
      fixedCommissionMinor: 101,
    });
    expect([...shares.values()].reduce((sum, value) => sum + value, 0)).toBe(
      101,
    );
    expect(shares.get('a')).toBe(34);
    expect(shares.get('b')).toBe(67);
  });
  it('caps the commission across the entire bundle', () => {
    const shares = allocateBundleReferral(items, {
      kind: 'PERCENTAGE_CAPPED',
      percentageBps: 5000,
      maximumCommissionMinor: 100,
    });
    expect([...shares.values()].reduce((sum, value) => sum + value, 0)).toBe(
      100,
    );
  });
});
