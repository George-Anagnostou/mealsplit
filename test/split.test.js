import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, computeSplit, computeTip, toCents, fmt, UNASSIGNED } from '../js/split.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('allocate: sums exactly and distributes pennies', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(sum(allocate(100, [1, 1, 1], 1)), 100);
  assert.deepEqual(allocate(100, [1, 1, 1], 1), [33, 34, 33]); // rotated tie-break
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]); // 1.67,3.33,5 -> largest remainder
  assert.equal(sum(allocate(1, [1, 1, 1, 1])), 1);
});

test('allocate: zero / negative / degenerate weights', () => {
  assert.deepEqual(allocate(0, [3, 4]), [0, 0]);
  assert.deepEqual(allocate(9, [0, 0, 0]), [3, 3, 3]); // falls back to even
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(allocate(500, [1]), [500]);
  assert.deepEqual(allocate(500, []), []);
});

test('allocate: random property — always reconciles', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 2000; i++) {
    const n = 1 + Math.floor(rnd() * 8);
    const w = Array.from({ length: n }, () => Math.floor(rnd() * 5000));
    const total = Math.floor(rnd() * 200000) - 20000;
    const r = allocate(total, w, Math.floor(rnd() * 10));
    assert.equal(sum(r), total);
  }
});

test('proportional tax and tip', () => {
  // Sam $10, Alex $30. tax 4.00, tip 8.00 => Sam 1/4, Alex 3/4
  const items = [
    { cents: 1000, who: ['sam'] },
    { cents: 3000, who: ['alex'] },
  ];
  const r = computeSplit(items, { taxC: 400, tipC: 800 });
  assert.equal(r.parties.sam.taxC, 100);
  assert.equal(r.parties.sam.tipC, 200);
  assert.equal(r.parties.sam.totalC, 1300);
  assert.equal(r.parties.alex.totalC, 3900);
  assert.equal(r.totalC, 5200);
  assert.equal(r.totalC, r.expectedTotalC);
});

test('shared items split evenly, odd cents rotate', () => {
  const items = [{ cents: 1000, who: ['a', 'b', 'c'] }];
  const r = computeSplit(items);
  assert.equal(r.parties.a.itemsC + r.parties.b.itemsC + r.parties.c.itemsC, 1000);
  assert.deepEqual([r.parties.a.itemsC, r.parties.b.itemsC, r.parties.c.itemsC].sort(), [333, 333, 334]);
  // two odd-cent items shouldn't both penalise the same person
  const r2 = computeSplit([{ cents: 101, who: ['a', 'b'] }, { cents: 101, who: ['a', 'b'] }]);
  assert.equal(r2.parties.a.itemsC, 101);
  assert.equal(r2.parties.b.itemsC, 101);
});

test('mixed shared + solo items', () => {
  const items = [
    { cents: 1200, who: ['me', 'sam'] }, // appetizer shared
    { cents: 1800, who: ['sam'] },
    { cents: 900, who: ['me'] },
  ];
  const r = computeSplit(items, { taxC: 300, tipC: 600 });
  assert.equal(r.parties.sam.itemsC, 2400);
  assert.equal(r.parties.me.itemsC, 1500);
  assert.equal(r.parties.sam.taxC + r.parties.me.taxC, 300);
  assert.equal(r.parties.sam.tipC, 369); // 600 * 24/39 = 369.23
  assert.equal(r.totalC, 3900 + 300 + 600);
});

test('penny reconciliation with awkward numbers', () => {
  const items = [
    { cents: 1299, who: ['a'] },
    { cents: 1099, who: ['b'] },
    { cents: 1499, who: ['c'] },
    { cents: 777, who: ['a', 'b', 'c'] },
  ];
  const r = computeSplit(items, { taxC: 337, tipC: 1111, feesC: 299, discountC: 501 });
  assert.equal(r.totalC, r.expectedTotalC);
  assert.equal(r.totalC, 1299 + 1099 + 1499 + 777 + 337 + 1111 + 299 - 501);
  for (const p of Object.values(r.parties)) assert.equal(p.totalC, p.itemsC + p.taxC + p.tipC + p.feesC + p.discountC);
});

test('fees split evenly vs proportionally', () => {
  const items = [{ cents: 1000, who: ['a'] }, { cents: 3000, who: ['b'] }];
  const prop = computeSplit(items, { feesC: 400 });
  assert.equal(prop.parties.a.feesC, 100);
  assert.equal(prop.parties.b.feesC, 300);
  const even = computeSplit(items, { feesC: 400, feesEven: true });
  assert.equal(even.parties.a.feesC, 200);
  assert.equal(even.parties.b.feesC, 200);
  const odd = computeSplit(items, { feesC: 301, feesEven: true });
  assert.equal(odd.parties.a.feesC + odd.parties.b.feesC, 301);
});

test('discount reduces totals proportionally', () => {
  const items = [{ cents: 2000, who: ['a'] }, { cents: 2000, who: ['b'] }];
  const r = computeSplit(items, { discountC: 500 });
  assert.equal(r.parties.a.discountC, -250);
  assert.equal(r.parties.a.totalC, 1750);
  assert.equal(r.totalC, 3500);
});

test('unassigned items are tracked and the total still reconciles', () => {
  const items = [{ cents: 1000, who: ['a'] }, { cents: 1000, who: [] }];
  const r = computeSplit(items, { taxC: 200, tipC: 200 });
  assert.equal(r.parties[UNASSIGNED].itemsC, 1000);
  assert.equal(r.parties.a.totalC, 1200); // unassigned item carries its own tax/tip share
  assert.equal(r.parties[UNASSIGNED].totalC, 1200);
  assert.equal(r.totalC, 2400);
});

test('edge cases: no items, one person, zero-price item, free-only assigned', () => {
  const none = computeSplit([], { taxC: 100 });
  assert.equal(none.totalC, 0); // nobody to allocate to
  const one = computeSplit([{ cents: 1500, who: ['a'] }], { taxC: 133, tipC: 300, feesC: 99, feesEven: true });
  assert.equal(one.parties.a.totalC, 1500 + 133 + 300 + 99);
  const zero = computeSplit([{ cents: 0, who: ['a'] }, { cents: 1000, who: ['b'] }], { taxC: 100 });
  assert.equal(zero.parties.a.taxC, 0);
  assert.equal(zero.parties.b.taxC, 100);
  // duplicate ids in who are de-duplicated
  const dup = computeSplit([{ cents: 1000, who: ['a', 'a'] }]);
  assert.equal(dup.parties.a.itemsC, 1000);
});

test('tip: percent of subtotal vs flat', () => {
  assert.equal(computeTip(5000, 'pct', 20, 0), 1000);
  assert.equal(computeTip(3333, 'pct', 18, 0), 600); // 599.94 -> 600
  assert.equal(computeTip(5000, 'amt', 20, 750), 750);
  assert.equal(computeTip(5000, 'pct', '', 0), 0);
});

test('money helpers', () => {
  assert.equal(toCents('$12.99'), 1299);
  assert.equal(toCents('1,234.50'), 123450);
  assert.equal(toCents('12,99'), 1299);
  assert.equal(toCents(''), 0);
  assert.equal(toCents('abc'), 0);
  assert.equal(fmt(1462), '$14.62');
  assert.equal(fmt(5), '$0.05');
  assert.equal(fmt(-250), '-$2.50');
});
