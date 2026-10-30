import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReceipt } from '../js/parser.js';

const load = (n) => parseReceipt(readFileSync(new URL(`./receipts/${n}.txt`, import.meta.url), 'utf8'));
const sum = (r) => r.items.reduce((a, b) => a + b.cents, 0);

test('restaurant receipt with suggested-tip noise', () => {
  const r = load('restaurant');
  assert.equal(r.items.length, 6);
  assert.deepEqual(r.items[0], { name: '2× Carne Asada Taco', cents: 700 });
  assert.deepEqual(r.items[1], { name: 'Chicken Burrito', cents: 1250 });
  assert.equal(r.subtotalC, 5750);
  assert.equal(sum(r), 5750);
  assert.equal(r.taxC, 496);
  assert.equal(r.tipC, 0); // suggestions are not a tip
  assert.equal(r.totalC, 6246);
  assert.equal(r.feesC, 0);
  assert.deepEqual(r.warnings, []);
});

test('DoorDash-style: label and price on separate lines, fees, promo, tip', () => {
  const r = load('doordash');
  assert.deepEqual(r.items.map((i) => i.name), ['Burrito Bowl - Chicken', '2× Chips & Guacamole', 'Kids Quesadilla', 'Fountain Drink']);
  assert.deepEqual(r.items.map((i) => i.cents), [1195, 890, 545, 299]);
  assert.equal(r.subtotalC, 2929);
  assert.equal(r.feesC, 199 + 440);
  assert.equal(r.feeLines.length, 2); // $0.00 small-order fee dropped
  assert.equal(r.taxC, 271);
  assert.equal(r.discountC, 500);
  assert.equal(r.tipC, 400);
  assert.equal(r.totalC, 3739);
  assert.deepEqual(r.warnings, []);
  // reconciles: subtotal + fees + tax - promo + tip = total
  assert.equal(2929 + 639 + 271 - 500 + 400, 3739);
});

test('Uber Eats-style: one-line items, qty, fees, savings, payment line ignored', () => {
  const r = load('ubereats');
  assert.deepEqual(r.items.map((i) => i.name), ['Pad Thai', 'Green Curry', '2× Thai Iced Tea', 'Mango Sticky Rice']);
  assert.equal(r.subtotalC, 4575);
  assert.equal(r.feesC, 99 + 686 + 412);
  assert.equal(r.tipC, 700);
  assert.equal(r.discountC, 350);
  assert.equal(r.totalC, 6122);
  assert.equal(r.items.length, 4); // Visa line did not become an item
  assert.deepEqual(r.warnings, []);
});

test('noisy OCR: dot leaders, tax flags, odd spacing, gratuity, payment footer', () => {
  const r = load('noisy-ocr');
  assert.equal(r.items.length, 6);
  assert.equal(r.items[0].name, 'Classic Burger');
  assert.equal(r.items[0].cents, 1395);
  assert.equal(r.items[4].cents, 625);
  assert.equal(r.items[5].cents, 1300);
  assert.equal(r.items[4].name, 'Side Salad');
  assert.equal(r.items[5].name, '2× Draft Beer');
  assert.equal(r.subtotalC, 6315);
  assert.equal(r.taxC, 552);
  assert.equal(r.tipC, 1263);
  assert.equal(r.totalC, 8130);
  assert.deepEqual(r.warnings, []);
});

test('warns when items do not match subtotal; warns on empty', () => {
  const r = parseReceipt('Burger 10.00\nSubtotal 25.00\nTotal 25.00');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /subtotal/);
  assert.match(parseReceipt('hello world').warnings[0], /No items/);
  assert.equal(parseReceipt('').items.length, 0);
});

test('thousands separators, parenthesised negatives, comma decimals', () => {
  const r = parseReceipt('Party platter 1,250.00\nCoupon (5.00)\nTotal 1,245.00');
  assert.equal(r.items[0].cents, 125000);
  assert.equal(r.discountC, 500);
  assert.equal(r.totalC, 124500);
  assert.equal(parseReceipt('Pizza 12,99').items[0].cents, 1299);
});
