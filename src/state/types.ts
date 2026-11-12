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
  /** Stable id: saving the same bill to history twice updates one entry. */
  id: string;
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

/** A finished (or abandoned) bill kept in history, with the friends who were at it. */
export interface Meal {
  /** Epoch ms when it was last saved. */
  savedAt: number;
  bill: Bill;
  /** Snapshot of the friends at this meal, so it still reads right if they are deleted later. */
  people: Friend[];
}

export type Tab = 'receipt' | 'people' | 'assign' | 'split' | 'history';
export const TABS: readonly Tab[] = ['receipt', 'people', 'assign', 'split', 'history'];

export interface AppState {
  me: Me;
  /** Saved friends, with their payment handles. */
  people: Friend[];
  bill: Bill;
  /** Newest first, at most `HISTORY_LIMIT`. */
  history: Meal[];
  /** The tab you were on, so the app reopens where you left it. */
  tab: Tab;
}
