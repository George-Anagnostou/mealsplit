import { describe, expect, test } from 'vitest';
import doordash from './__fixtures__/receipts/doordash.txt?raw';
import edgeCases from './__fixtures__/receipts/edge-cases.txt?raw';
import grubhub from './__fixtures__/receipts/grubhub.txt?raw';
import noisyOcr from './__fixtures__/receipts/noisy-ocr.txt?raw';
import restaurant from './__fixtures__/receipts/restaurant.txt?raw';
import squareToast from './__fixtures__/receipts/square-toast.txt?raw';
import ubereats from './__fixtures__/receipts/ubereats.txt?raw';
import { isLowConfidence, LOW_CONFIDENCE, type ParsedReceipt, parseReceipt } from './parser';

const fixtures = {
  restaurant,
  doordash,
  ubereats,
  'noisy-ocr': noisyOcr,
  'square-toast': squareToast,
  grubhub,
  'edge-cases': edgeCases,
};
const load = (n: keyof typeof fixtures) => parseReceipt(fixtures[n]);
const sum = (r: ParsedReceipt) => r.items.reduce((a, b) => a + b.cents, 0);

test('restaurant receipt with suggested-tip noise', () => {
  const r = load('restaurant');
  expect(r.items.length).toBe(6);
  expect(r.items[0]).toMatchObject({ name: '2× Carne Asada Taco', cents: 700 });
  expect(r.items[1]).toMatchObject({ name: 'Chicken Burrito', cents: 1250 });
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

test('Square/Toast-style: modifiers, numeric names, discount, auto-gratuity service charge', () => {
  const r = load('square-toast');
  expect(r.items.map((i) => [i.name, i.cents])).toEqual([
    ['2× Margherita Pizza', 2800],
    ['Caesar Salad', 950],
    ['Add Chicken', 400],
    ['3× Draft IPA', 2100],
    ['7 Up', 250],
    ['12 oz Ribeye', 3800],
  ]);
  expect(r.subtotalC).toBe(10300);
  expect(r.discountC).toBe(400);
  expect(r.taxC).toBe(854);
  expect(r.feesC).toBe(1782); // "Service Charge (18%)" is a fee, not a tip
  expect(r.feeLines.map((f) => f.name)).toEqual(['Service Charge (18%)']);
  expect(r.tipC).toBe(0);
  expect(r.totalC).toBe(12536);
  expect(r.warnings).toEqual([]);
  expect(103.0 - 4 + 8.54 + 17.82).toBeCloseTo(125.36, 2);
});

test('Grubhub-style: split lines, promo code, item names that contain fee words', () => {
  const r = load('grubhub');
  expect(r.items.map((i) => [i.name, i.cents])).toEqual([
    ['Chicken Pad See Ew', 1595],
    ['Spring Rolls (4)', 650],
    ['2× Thai Iced Tea', 700],
    ['Delivery Pizza Combo', 1100],
    ['Bag of Chips', 200],
  ]);
  expect(r.subtotalC).toBe(4245);
  expect(r.feeLines.map((f) => f.name)).toEqual(['Delivery Fee', 'Service Fee']);
  expect(r.feesC).toBe(694);
  expect(r.taxC).toBe(371);
  expect(r.tipC).toBe(600);
  expect(r.discountC).toBe(1000);
  expect(r.totalC).toBe(4910);
  expect(r.warnings).toEqual([]);
  // reconciles: subtotal + fees + tax + tip - promo = total
  expect(4245 + 694 + 371 + 600 - 1000).toBe(4910);
});

describe('edge-case fixture: every probe', () => {
  const r = load('edge-cases');
  const names = r.items.map((i) => i.name);
  const price = (name: string) => r.items.find((i) => i.name === name)?.cents;

  test.each([
    ['7 Up', 250],
    ['12 oz Ribeye', 3800],
    ['Delivery Pizza', 1800],
    ['Bag of Chips', 300],
    ['Gift Card Salad', 1100],
    ['Member Special Burger', 1400],
    ['Credit Brulee', 700],
  ])('%s stays an item named exactly that', (name, cents) => {
    expect(price(name)).toBe(cents);
  });

  test('real quantities still become quantities', () => {
    expect(names.filter((n) => n === '2× Tacos').length).toBe(3); // "2 Tacos", "2x Tacos", "Tacos 2 @ 4.00"
    expect(names).not.toContain('7× Up');
    expect(names).not.toContain('12× oz Ribeye');
  });

  test('real fee and discount lines are still fees and discounts', () => {
    expect(r.feeLines.map((f) => [f.name, f.cents])).toEqual([
      ['Delivery Fee', 299],
      ['Bag fee', 10],
      ['Service fee', 150],
    ]);
    expect(r.feesC).toBe(459);
    expect(r.discountC).toBe(200 + 500 + 300); // Member discount, Promo, Credit
  });

  test('the whole receipt reconciles with no warnings', () => {
    expect(r.items.length).toBe(10);
    expect(sum(r)).toBe(r.subtotalC);
    expect(r.subtotalC).toBe(11750);
    expect(r.totalC).toBe(11209);
    expect(r.warnings).toEqual([]);
  });
});

describe('leading numbers', () => {
  const one = (text: string) => parseReceipt(text).items[0];

  test.each([
    ['7 Up 2.50', '7 Up'],
    ['7-Up 2.50', '7-Up'],
    ['12 oz Ribeye 38.00', '12 oz Ribeye'],
    ['6 pc Nuggets 7.00', '6 pc Nuggets'],
    ['16 fl oz Lemonade 4.00', '16 fl oz Lemonade'],
    ['2 Tacos 8.00', '2× Tacos'],
    ['2x Tacos 8.00', '2× Tacos'],
    ['2 x Tacos 8.00', '2× Tacos'],
    ['2× Tacos 8.00', '2× Tacos'],
    ['Tacos 2 @ 4.00 8.00', '2× Tacos'],
    ['(2) Tacos 8.00', '2× Tacos'],
    ['1 Burrito 9.00', 'Burrito'],
    ['1x Burrito 9.00', 'Burrito'],
    ['12 Wings 14.00', '12× Wings'],
    ['1  7 Up 2.50', '7 Up'], // quantity column, then a numeric name
    ['2  12 oz Ribeye 76.00', '2× 12 oz Ribeye'],
  ])('%s -> %s', (line, name) => {
    expect(one(line).name).toBe(name);
  });

  test('a bare number that would make each unit under $0.50 stays in the name', () => {
    const i = one('9 Lives Stout 3.00');
    expect(i.name).toBe('9 Lives Stout');
    expect(i.reasons).toContain('leading-number-kept');
    expect(isLowConfidence(i)).toBe(true);
    expect(one('0 Calorie Soda 2.00').name).toBe('0 Calorie Soda');
  });

  test('quantity on its own line before the label', () => {
    expect(parseReceipt('2x\nTacos 8.00').items[0].name).toBe('2× Tacos');
    expect(parseReceipt('2x\nTacos\n8.00').items[0].name).toBe('2× Tacos');
    expect(parseReceipt('1x\nTacos\n4.00').items[0].name).toBe('Tacos');
  });
});

describe('fee, discount and item classification', () => {
  const parse = (text: string) => parseReceipt(text);

  test.each([
    'Delivery Pizza 18.00',
    'Bag of Chips 3.00',
    'Gift Card Salad 11.00',
    'Member Special Burger 14.00',
    'Credit Brulee 7.00',
    'Promo Burger 12.00',
    'Delivery Combo Platter 20.00',
    'Free Delivery Burrito 11.00',
    'Gift Card 25.00', // buying a gift card is a purchase
    'Coupon Chicken Wings 9.00',
    'Booking Table Nachos 6.00',
    'Reward Bowl 8.00',
  ])('%s is an item', (line) => {
    const r = parse(line);
    expect(r.items.length).toBe(1);
    expect(r.feesC + r.discountC).toBe(0);
  });

  test.each([
    'Delivery Fee 2.99',
    'Bag fee 0.10',
    'Service fee 1.50',
    'Service Charge 4.00',
    'Delivery 2.99',
    'Bag 0.10',
    'Packaging 0.50',
    'Delivery Charge 3.00',
    'Small Order 1.99',
    'Small Order Fee 1.99',
    'Booking Fee 1.00',
    'Regulatory Response Fee 0.75',
    'Surcharge 1.00',
    'Taxes & Fees 4.12',
    'Convenience Fee (2) 1.00',
  ])('%s is a fee', (line) => {
    const r = parse(line);
    expect(r.items.length).toBe(0);
    expect(r.feesC).toBeGreaterThan(0);
  });

  test.each([
    'Member discount -2.00',
    'Promo -5.00',
    'Credit -3.00',
    'Gift Card -25.00',
    'Promo: DASH20 -$5.00',
    'Uber One Savings -$3.50',
    'Coupon (5.00)',
    'Reward 5.00-',
    'Member Discount 2.00', // minus lost, but every word is discount vocabulary
    'Promo: DASH20 5.00',
    'Delivery Discount 2.00',
    'Discount 4.00',
  ])('%s is a discount', (line) => {
    const r = parse(line);
    expect(r.items.length).toBe(0);
    expect(r.discountC).toBeGreaterThan(0);
  });

  test('a $0.00 fee is dropped; fees after the total are ignored', () => {
    expect(parse('Delivery Fee 0.00').feesC).toBe(0);
    const r = parse('Burger 10.00\nTotal 10.00\nService Fee 2.00\nCoupon -1.00\nPizza 5.00');
    expect(r.feesC + r.discountC).toBe(0);
    expect(r.items.length).toBe(1);
  });

  test('tax lines are still tax; "Taxes & Fees" is a fee', () => {
    const r = parse('Sales Tax 8.5% 3.20\nVAT 1.00\nTaxes & Fees 2.00');
    expect(r.taxC).toBe(420);
    expect(r.feesC).toBe(200);
  });
});

describe('confidence', () => {
  const one = (text: string) => parseReceipt(text).items[0];

  test('clean lines score 1 with no reasons', () => {
    const i = one('Chicken Burrito 12.50');
    expect(i.confidence).toBe(1);
    expect(i.reasons).toEqual([]);
    expect(isLowConfidence(i)).toBe(false);
  });

  test('scores stay within 0..1 and every item carries reasons that match the score', () => {
    for (const f of Object.values(fixtures)) {
      for (const i of parseReceipt(f).items) {
        expect(i.confidence).toBeGreaterThanOrEqual(0);
        expect(i.confidence).toBeLessThanOrEqual(1);
        expect(i.confidence === 1).toBe(i.reasons.length === 0);
      }
    }
  });

  test('every shipped fixture item is at or above the low-confidence threshold', () => {
    for (const f of Object.values(fixtures)) {
      for (const i of parseReceipt(f).items) {
        expect(i.confidence, `${i.name}: ${i.reasons}`).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
      }
    }
  });

  test('keyword-in-name is a mild flag, not a low-confidence one', () => {
    const i = one('Delivery Pizza 18.00');
    expect(i.reasons).toEqual(['keyword-in-name']);
    expect(isLowConfidence(i)).toBe(false);
  });

  test('label on a previous line is noted', () => {
    expect(one('Burger\n12.00').reasons).toEqual(['label-on-previous-line']);
  });

  test('OCR noise is low confidence', () => {
    const i = one('B~u|rg#er ¢ 12.00');
    expect(i.reasons).toContain('odd-characters');
    expect(isLowConfidence(i)).toBe(true);
  });

  test('very short names, negative prices and high prices are flagged', () => {
    expect(one('Ab 3.00').reasons).toContain('short-name');
    const neg = one('Adjustment -1.00');
    expect(neg.reasons).toContain('negative-price');
    expect(isLowConfidence(neg)).toBe(true);
    expect(one('Wedding Cake 300.00').reasons).toContain('high-price');
  });

  test('an item costing more than the subtotal is low confidence', () => {
    const r = parseReceipt('Burger 10.00\nFish 90.00\nSubtotal 20.00\nTotal 20.00');
    expect(r.items[0].reasons).toEqual([]);
    expect(r.items[1].reasons).toContain('exceeds-subtotal');
    expect(isLowConfidence(r.items[1])).toBe(true);
  });

  test('reasons stack', () => {
    const i = parseReceipt('Ab 900.00\nSubtotal 1.00').items[0];
    expect(i.reasons).toEqual(['short-name', 'high-price', 'exceeds-subtotal']);
    expect(i.confidence).toBe(0.1);
  });
});

test('the parser is pure: same input, same output; input untouched', () => {
  const text = fixtures.grubhub;
  const copy = `${text}`;
  expect(parseReceipt(text)).toEqual(parseReceipt(text));
  expect(text).toBe(copy);
});

test('null, undefined, CRLF and junk lines', () => {
  expect(parseReceipt(null).items).toEqual([]);
  expect(parseReceipt(undefined).items).toEqual([]);
  const r = parseReceipt('Burger 10.00\r\nFries 4.00\r\n');
  expect(r.items.map((i) => i.name)).toEqual(['Burger', 'Fries']);
  expect(parseReceipt('18% = 9.00').items).toEqual([]); // percentage noise
  expect(parseReceipt('Visa 20.00').items).toEqual([]); // payment line
  expect(parseReceipt('Burger 0.00').items).toEqual([]); // free items are dropped
});
