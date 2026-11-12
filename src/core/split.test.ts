import { expect, test } from 'vitest';
import { allocate, computeSplit, computeTip, UNASSIGNED } from './split';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test('allocate: sums exactly and distributes pennies', () => {
  expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  expect(sum(allocate(100, [1, 1, 1], 1))).toBe(100);
  expect(allocate(100, [1, 1, 1], 1)).toEqual([33, 34, 33]); // rotated tie-break
  expect(allocate(10, [1, 2, 3])).toEqual([2, 3, 5]); // 1.67,3.33,5 -> largest remainder
  expect(sum(allocate(1, [1, 1, 1, 1]))).toBe(1);
});

test('allocate: zero / negative / degenerate weights', () => {
  expect(allocate(0, [3, 4])).toEqual([0, 0]);
  expect(allocate(9, [0, 0, 0])).toEqual([3, 3, 3]); // falls back to even
  expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  expect(allocate(500, [1])).toEqual([500]);
  expect(allocate(500, [])).toEqual([]);
});

test('allocate: random property — always reconciles', () => {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2000; i++) {
    const n = 1 + Math.floor(rnd() * 8);
    const w = Array.from({ length: n }, () => Math.floor(rnd() * 5000));
    const total = Math.floor(rnd() * 200000) - 20000;
    const r = allocate(total, w, Math.floor(rnd() * 10));
    expect(sum(r)).toBe(total);
  }
});

test('proportional tax and tip', () => {
  // Sam $10, Alex $30. tax 4.00, tip 8.00 => Sam 1/4, Alex 3/4
  const items = [
    { cents: 1000, who: ['sam'] },
    { cents: 3000, who: ['alex'] },
  ];
  const r = computeSplit(items, { taxC: 400, tipC: 800 });
  expect(r.parties.sam.taxC).toBe(100);
  expect(r.parties.sam.tipC).toBe(200);
  expect(r.parties.sam.totalC).toBe(1300);
  expect(r.parties.alex.totalC).toBe(3900);
  expect(r.totalC).toBe(5200);
  expect(r.totalC).toBe(r.expectedTotalC);
});

test('shared items split evenly, odd cents rotate', () => {
  const items = [{ cents: 1000, who: ['a', 'b', 'c'] }];
  const r = computeSplit(items);
  expect(r.parties.a.itemsC + r.parties.b.itemsC + r.parties.c.itemsC).toBe(1000);
  expect([r.parties.a.itemsC, r.parties.b.itemsC, r.parties.c.itemsC].sort()).toEqual([
    333, 333, 334,
  ]);
  // two odd-cent items shouldn't both penalise the same person
  const r2 = computeSplit([
    { cents: 101, who: ['a', 'b'] },
    { cents: 101, who: ['a', 'b'] },
  ]);
  expect(r2.parties.a.itemsC).toBe(101);
  expect(r2.parties.b.itemsC).toBe(101);
});

test('mixed shared + solo items', () => {
  const items = [
    { cents: 1200, who: ['me', 'sam'] }, // appetizer shared
    { cents: 1800, who: ['sam'] },
    { cents: 900, who: ['me'] },
  ];
  const r = computeSplit(items, { taxC: 300, tipC: 600 });
  expect(r.parties.sam.itemsC).toBe(2400);
  expect(r.parties.me.itemsC).toBe(1500);
  expect(r.parties.sam.taxC + r.parties.me.taxC).toBe(300);
  expect(r.parties.sam.tipC).toBe(369); // 600 * 24/39 = 369.23
  expect(r.totalC).toBe(3900 + 300 + 600);
});

test('penny reconciliation with awkward numbers', () => {
  const items = [
    { cents: 1299, who: ['a'] },
    { cents: 1099, who: ['b'] },
    { cents: 1499, who: ['c'] },
    { cents: 777, who: ['a', 'b', 'c'] },
  ];
  const r = computeSplit(items, { taxC: 337, tipC: 1111, feesC: 299, discountC: 501 });
  expect(r.totalC).toBe(r.expectedTotalC);
  expect(r.totalC).toBe(1299 + 1099 + 1499 + 777 + 337 + 1111 + 299 - 501);
  for (const p of Object.values(r.parties))
    expect(p.totalC).toBe(p.itemsC + p.taxC + p.tipC + p.feesC + p.discountC);
});

test('fees split evenly vs proportionally', () => {
  const items = [
    { cents: 1000, who: ['a'] },
    { cents: 3000, who: ['b'] },
  ];
  const prop = computeSplit(items, { feesC: 400 });
  expect(prop.parties.a.feesC).toBe(100);
  expect(prop.parties.b.feesC).toBe(300);
  const even = computeSplit(items, { feesC: 400, feesEven: true });
  expect(even.parties.a.feesC).toBe(200);
  expect(even.parties.b.feesC).toBe(200);
  const odd = computeSplit(items, { feesC: 301, feesEven: true });
  expect(odd.parties.a.feesC + odd.parties.b.feesC).toBe(301);
});

test('discount reduces totals proportionally', () => {
  const items = [
    { cents: 2000, who: ['a'] },
    { cents: 2000, who: ['b'] },
  ];
  const r = computeSplit(items, { discountC: 500 });
  expect(r.parties.a.discountC).toBe(-250);
  expect(r.parties.a.totalC).toBe(1750);
  expect(r.totalC).toBe(3500);
});

test('unassigned items are tracked and the total still reconciles', () => {
  const items = [
    { cents: 1000, who: ['a'] },
    { cents: 1000, who: [] },
  ];
  const r = computeSplit(items, { taxC: 200, tipC: 200 });
  expect(r.parties[UNASSIGNED].itemsC).toBe(1000);
  expect(r.parties.a.totalC).toBe(1200); // unassigned item carries its own tax/tip share
  expect(r.parties[UNASSIGNED].totalC).toBe(1200);
  expect(r.totalC).toBe(2400);
});

test('edge cases: no items, one person, zero-price item, free-only assigned', () => {
  const none = computeSplit([], { taxC: 100 });
  expect(none.totalC).toBe(0); // nobody to allocate to
  const one = computeSplit([{ cents: 1500, who: ['a'] }], {
    taxC: 133,
    tipC: 300,
    feesC: 99,
    feesEven: true,
  });
  expect(one.parties.a.totalC).toBe(1500 + 133 + 300 + 99);
  const zero = computeSplit(
    [
      { cents: 0, who: ['a'] },
      { cents: 1000, who: ['b'] },
    ],
    { taxC: 100 },
  );
  expect(zero.parties.a.taxC).toBe(0);
  expect(zero.parties.b.taxC).toBe(100);
  // duplicate ids in who are de-duplicated
  const dup = computeSplit([{ cents: 1000, who: ['a', 'a'] }]);
  expect(dup.parties.a.itemsC).toBe(1000);
});

test('tip: percent of subtotal vs flat', () => {
  expect(computeTip(5000, 'pct', 20, 0)).toBe(1000);
  expect(computeTip(3333, 'pct', 18, 0)).toBe(600); // 599.94 -> 600
  expect(computeTip(5000, 'amt', 20, 750)).toBe(750);
  expect(computeTip(5000, 'pct', '', 0)).toBe(0);
});
