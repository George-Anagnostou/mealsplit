import { dollars, toCents } from '../core/money';

/** Parse and format an amount typed into a money field (blank when zero). */
export const moneyParse = (t: string): number => Math.max(0, toCents(t));
export const moneyFormat = (c: number): string => (c ? dollars(c) : '');
