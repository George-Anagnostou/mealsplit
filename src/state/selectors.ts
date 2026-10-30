import { billNote } from '../core/links';
import {
  clampDiscount,
  computeSplit,
  computeTip,
  type SplitOptions,
  type SplitResult,
} from '../core/split';
import { type AppState, type Bill, type Friend, ME } from './types';

export interface Party {
  id: string;
  name: string;
  me?: boolean;
}

/** "Me" first, then the friends ticked as present. */
export const partiesOf = (s: AppState): Party[] => [
  { id: ME, name: s.me.name || 'Me', me: true },
  ...s.people.filter((p) => s.bill.here.includes(p.id)),
];

export const nameOf = (s: AppState, id: string): string =>
  id === ME ? s.me.name || 'Me' : s.people.find((p) => p.id === id)?.name || '?';

export const friendById = (s: AppState, id: string): Friend | undefined =>
  s.people.find((p) => p.id === id);

export const subtotalOf = (b: Bill): number => b.items.reduce((a, i) => a + (i.cents || 0), 0);
export const tipOf = (b: Bill): number => computeTip(subtotalOf(b), b.tipMode, b.tipPct, b.tipAmtC);
export const noteOf = (b: Bill): string => billNote(b.title || 'Dinner', b.date);
export const grandTotalOf = (b: Bill): number =>
  subtotalOf(b) + b.taxC + tipOf(b) + b.feesC - clampDiscount(b.discountC, subtotalOf(b));

/** Only people who are present count as assignees. */
export const presentWho = (b: Bill, who: string[]): string[] =>
  who.filter((id) => id === ME || b.here.includes(id));

const splitOptions = (b: Bill): SplitOptions => ({
  taxC: b.taxC,
  tipC: tipOf(b),
  feesC: b.feesC,
  discountC: b.discountC,
  feesEven: b.feesEven,
});

export const computeBill = (b: Bill): SplitResult =>
  computeSplit(
    b.items.map((i) => ({ cents: i.cents, who: presentWho(b, i.who) })),
    splitOptions(b),
  );
