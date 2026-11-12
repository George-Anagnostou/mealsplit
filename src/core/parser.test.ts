import { expect, test } from 'vitest';
import doordash from './__fixtures__/receipts/doordash.txt?raw';
import noisyOcr from './__fixtures__/receipts/noisy-ocr.txt?raw';
import restaurant from './__fixtures__/receipts/restaurant.txt?raw';
import ubereats from './__fixtures__/receipts/ubereats.txt?raw';
import { type ParsedReceipt, parseReceipt } from './parser';

const fixtures = { restaurant, doordash, ubereats, 'noisy-ocr': noisyOcr };
const load = (n: keyof typeof fixtures) => parseReceipt(fixtures[n]);
const sum = (r: ParsedReceipt) => r.items.reduce((a, b) => a + b.cents, 0);

test('restaurant receipt with suggested-tip noise', () => {
  const r = load('restaurant');
  expect(r.items.length).toBe(6);
  expect(r.items[0]).toEqual({ name: '2× Carne Asada Taco', cents: 700 });
  expect(r.items[1]).toEqual({ name: 'Chicken Burrito', cents: 1250 });
  expect(r.subtotalC).toBe(5750);
  expect(sum(r)).toBe(5750);
  expect(r.taxC).toBe(496);
  expect(r.tipC).toBe(0); // suggestions are not a tip
  expect(r.totalC).toBe(6246);
  expect(r.feesC).toBe(0);
  expect(r.warnings).toEqual([]);
});

test('DoorDash-style: label and price on separate lines, fees, promo, tip', () => {
  const r = load('doordash');
  expect(r.items.map((i) => i.name)).toEqual([
    'Burrito Bowl - Chicken',
    '2× Chips & Guacamole',
    'Kids Quesadilla',
    'Fountain Drink',
  ]);
  expect(r.items.map((i) => i.cents)).toEqual([1195, 890, 545, 299]);
  expect(r.subtotalC).toBe(2929);
  expect(r.feesC).toBe(199 + 440);
  expect(r.feeLines.length).toBe(2); // $0.00 small-order fee dropped
  expect(r.taxC).toBe(271);
  expect(r.discountC).toBe(500);
  expect(r.tipC).toBe(400);
  expect(r.totalC).toBe(3739);
  expect(r.warnings).toEqual([]);
  // reconciles: subtotal + fees + tax - promo + tip = total
  expect(2929 + 639 + 271 - 500 + 400).toBe(3739);
});

test('Uber Eats-style: one-line items, qty, fees, savings, payment line ignored', () => {
  const r = load('ubereats');
  expect(r.items.map((i) => i.name)).toEqual([
    'Pad Thai',
    'Green Curry',
    '2× Thai Iced Tea',
    'Mango Sticky Rice',
  ]);
  expect(r.subtotalC).toBe(4575);
  expect(r.feesC).toBe(99 + 686 + 412);
  expect(r.tipC).toBe(700);
  expect(r.discountC).toBe(350);
  expect(r.totalC).toBe(6122);
  expect(r.items.length).toBe(4); // Visa line did not become an item
  expect(r.warnings).toEqual([]);
});

test('noisy OCR: dot leaders, tax flags, odd spacing, gratuity, payment footer', () => {
  const r = load('noisy-ocr');
  expect(r.items.length).toBe(6);
  expect(r.items[0].name).toBe('Classic Burger');
  expect(r.items[0].cents).toBe(1395);
  expect(r.items[4].cents).toBe(625);
  expect(r.items[5].cents).toBe(1300);
  expect(r.items[4].name).toBe('Side Salad');
  expect(r.items[5].name).toBe('2× Draft Beer');
  expect(r.subtotalC).toBe(6315);
  expect(r.taxC).toBe(552);
  expect(r.tipC).toBe(1263);
  expect(r.totalC).toBe(8130);
  expect(r.warnings).toEqual([]);
});

test('warns when items do not match subtotal; warns on empty', () => {
  const r = parseReceipt('Burger 10.00\nSubtotal 25.00\nTotal 25.00');
  expect(r.warnings.length).toBe(1);
  expect(r.warnings[0]).toMatch(/subtotal/);
  expect(parseReceipt('hello world').warnings[0]).toMatch(/No items/);
  expect(parseReceipt('').items.length).toBe(0);
});

test('thousands separators, parenthesised negatives, comma decimals', () => {
  const r = parseReceipt('Party platter 1,250.00\nCoupon (5.00)\nTotal 1,245.00');
  expect(r.items[0].cents).toBe(125000);
  expect(r.discountC).toBe(500);
  expect(r.totalC).toBe(124500);
  expect(parseReceipt('Pizza 12,99').items[0].cents).toBe(1299);
});
