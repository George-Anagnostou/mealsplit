import { expect, test } from 'vitest';
import { fmt, toCents } from './money';

test('money helpers', () => {
  expect(toCents('$12.99')).toBe(1299);
  expect(toCents('1,234.50')).toBe(123450);
  expect(toCents('12,99')).toBe(1299);
  expect(toCents('')).toBe(0);
  expect(toCents('abc')).toBe(0);
  expect(fmt(1462)).toBe('$14.62');
  expect(fmt(5)).toBe('$0.05');
  expect(fmt(-250)).toBe('-$2.50');
});
