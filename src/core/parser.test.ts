import { describe, expect, test } from 'vitest';
import { parseReceipt } from './parser';
import { computeSplit, UNASSIGNED } from './split';

test('the requested format uses unit prices and treats tip as another row', () => {
  const result = parseReceipt('2x burger $10.00\n1 fries 3\ntip $3.22');
  expect(result.errors).toEqual([]);
  expect(result.items).toEqual([
    { name: 'burger', quantity: 2, unitC: 1000, cents: 2000 },
    { name: 'fries', quantity: 1, unitC: 300, cents: 300 },
    { name: 'tip', quantity: 1, unitC: 322, cents: 322 },
  ]);
  expect(result.subtotalC).toBe(2622);
});

test.each(['3', '$3', '3.0', '3.00', '$ 3.00'])('accepts price %s', (price) => {
  expect(parseReceipt(`fries ${price}`).items[0].unitC).toBe(300);
});

test.each(['-3.5', '-$3.50', '$-3.50'])('accepts signed unit price %s', (price) => {
  expect(parseReceipt(`2x credit ${price}`).items[0]).toMatchObject({
    unitC: -350,
    quantity: 2,
    cents: -700,
  });
});

test.each(['2', '2x', '2X', '2×', '2 x'])('accepts quantity %s', (quantity) => {
  expect(parseReceipt(`${quantity} burger 10`).items[0]).toMatchObject({
    name: 'burger',
    quantity: 2,
    unitC: 1000,
    cents: 2000,
  });
});

test('names are literal; no special adjustments, footer detection, or total cutoff', () => {
  const names = ['tax', 'tip', 'discount', 'Tri Tip Steak', 'total', 'subtotal', 'Visa', 'burger'];
  const result = parseReceipt(names.map((name) => `${name} 1`).join('\n'));
  expect(result.items.map((item) => item.name)).toEqual(names);
  expect(result.subtotalC).toBe(800);
});

test('keeps zero-price rows and zero does not become negative zero', () => {
  const result = parseReceipt('water 0\nnapkin -$0');
  expect(result.items).toHaveLength(2);
  expect(result.items[1].unitC).toBe(0);
  expect(result.subtotalC).toBe(0);
});

test('names may be multiword, accented, or one character; whitespace is harmless', () => {
  const result = parseReceipt('\n  2x café   au lait 3.5 \r\n茶 2\rA 1\n\n');
  expect(result.errors).toEqual([]);
  expect(result.items.map((item) => item.name)).toEqual(['café au lait', '茶', 'A']);
  expect(result.subtotalC).toBe(1000);
});

describe('explicit errors, never silently skipped or partially totaled', () => {
  test.each([
    'burger 1.234',
    'burger 1,50',
    'burger 1,000.00',
    'burger 12.OO',
    'burger',
    '3',
    'tip 20%',
    'burger 3 USD',
  ])('rejects malformed line %s', (line) => {
    const result = parseReceipt(`fries 3\n\n${line}`);
    expect(result.items).toHaveLength(1);
    expect(result.subtotalC).toBeNull();
    expect(result.errors).toEqual([
      {
        line: 3,
        text: line,
        message: expect.stringContaining('Use [quantity]'),
      },
    ]);
  });
  test.each(['0', '-2', '1.5', '999999999999999999999'])('rejects quantity %s', (q) => {
    expect(parseReceipt(`${q}x burger 3`).errors[0].message).toContain('positive whole');
  });
  test.each(['2x 3', '2 3'])('requires a name in %s', (line) => {
    expect(parseReceipt(line).errors[0].message).toContain('item name');
  });
  test('does not pair names and prices across lines', () => {
    expect(parseReceipt('burger\n10').errors.map((error) => error.line)).toEqual([1, 2]);
  });
  test.each([null, undefined, '', ' \n '])('empty input %s has no complete draft', (text) => {
    expect(parseReceipt(text)).toMatchObject({ items: [], subtotalC: null, errors: [{ line: 1 }] });
  });
  test('rejects unsafe unit amounts, products, and aggregate magnitudes', () => {
    for (const text of [
      'burger 999999999999999999999',
      '99999999999999x burger 100',
      'burger 90071992547409.91\ncredit -0.01',
    ]) {
      expect(parseReceipt(text).errors.at(-1)?.message).toContain('too large');
      expect(parseReceipt(text).subtotalC).toBeNull();
    }
  });
  test('is deterministic and retains exact source text for draft freshness', () => {
    const text = '  burger 3.5\r\ncredit -1\n';
    expect(parseReceipt(text)).toEqual(parseReceipt(text));
    expect(parseReceipt(text).source).toBe(text);
  });
});

test('three burgers stay grouped and split equally between two people', () => {
  const parsed = parseReceipt('3x burger 10\ntip 3.22\ncredit -2');
  const result = computeSplit(parsed.items.map((item) => ({ ...item, who: ['sam', 'alex'] })));
  expect(result.parties.sam.items[0]).toMatchObject({ shareC: 1500, of: 2 });
  expect(result.parties.alex.items[0].shareC).toBe(1500);
  expect(result.parties.sam.totalC).toBe(1561);
  expect(result.parties.alex.totalC).toBe(1561);
  expect(result.totalC).toBe(parsed.subtotalC);
});

test('signed penny allocation reconciles, including unassigned credits', () => {
  const result = computeSplit([
    { cents: 100, who: ['a', 'b', 'c'] },
    { cents: -101, who: ['a', 'b', 'c'] },
    { cents: -10, who: [] },
  ]);
  expect(result.totalC).toBe(-11);
  expect(result.parties[UNASSIGNED].totalC).toBe(-10);
  expect(Object.values(result.parties).reduce((sum, p) => sum + p.totalC, 0)).toBe(-11);
});
