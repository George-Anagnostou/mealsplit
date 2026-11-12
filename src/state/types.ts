import type { TipMode } from '../core/split';

export const ME = 'me';

export interface Item {
  id: string;
  name: string;
  cents: number;
  /** Party ids (`ME` or a friend id) who had this item. */
  who: string[];
}

export interface Friend {
  id: string;
  name: string;
  venmo: string;
  contact: string;
}

export interface Me {
  name: string;
  venmo: string;
  contact: string;
}

export interface Bill {
  title: string;
  /** ISO date, yyyy-mm-dd */
  date: string;
  raw: string;
  items: Item[];
  taxC: number;
  feesC: number;
  discountC: number;
  tipMode: TipMode;
  tipPct: number;
  tipAmtC: number;
  feesEven: boolean;
  /** Friend ids who are at this meal. */
  here: string[];
  /** Total printed on the receipt, if the parser found one. */
  parsedTotalC: number | null;
}

export interface AppState {
  me: Me;
  people: Friend[];
  bill: Bill;
}

export type Tab = 'receipt' | 'people' | 'assign' | 'split';
